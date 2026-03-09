from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings
from supabase import create_client, Client
import tempfile
import os

router = APIRouter()
embeddings = None
supabase: Client = None

@router.on_event("startup")
def startup_event():
    global embeddings, supabase
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    # Initialize only if credentials present
    if supabase_url and supabase_key:
        supabase = create_client(supabase_url, supabase_key)
    # Using a multilingual transformer for embeddings
    # Note: On smaller RAM systems, you might want to switch to smaller models like "all-MiniLM-L6-v2"
    embeddings = HuggingFaceEmbeddings(model_name="BAAI/bge-m3", model_kwargs={'device': 'cpu'})

class PDFUploadRequest(BaseModel):
    user_id: str
    file_name: str
    file_base64: str

@router.post("/upload_pdf")
async def upload_pdf(req: PDFUploadRequest):
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    import base64
    try:
        pdf_bytes = base64.b64decode(req.file_base64)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid base64 payload")

    # Save to temp file to be loaded by PDFReader
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(pdf_bytes)
        tmp_path = tmp.name

    try:
        loader = PyPDFLoader(tmp_path)
        pages = loader.load()
        
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200,
            separators=["\n\n", "\n", ".", " ", ""]
        )
        chunks = text_splitter.split_documents(pages)
        
        # Vectorize and save in Supabase pgvector
        inserted = 0
        for i, chunk in enumerate(chunks):
            vector = embeddings.embed_query(chunk.page_content)
            data = {
                "user_id": req.user_id,
                "document_name": req.file_name,
                "content": chunk.page_content,
                "embedding": vector,
                "page": chunk.metadata.get("page", 0)
            }
            # Expected to insert into document_chunks table with embedding being a pgvector column.
            # RLS might need to be configured for this table.
            resp = supabase.table('document_chunks').insert(data).execute()
            inserted += 1
            
        return {"status": "success", "chunks_indexed": inserted}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

class AskRequest(BaseModel):
    user_id: str
    query: str

@router.post("/query")
async def query_rag(req: AskRequest):
    if supabase is None:
        raise HTTPException(status_code=500, detail="Supabase not configured")
        
    query_vector = embeddings.embed_query(req.query)
    # Execute RPC to match documents using cosine similarity
    # It requires a postgres function "match_documents" to exist.
    result = supabase.rpc("match_documents", {
        "query_embedding": query_vector,
        "match_threshold": 0.5,
        "match_count": 5,
        "p_user_id": req.user_id
    }).execute()
    
    context = ""
    sources = []
    if result.data:
        for match in result.data:
            context += f"Source ({match.get('document_name', 'Unknown')} page {match.get('page', '?')}):\n{match.get('content', '')}\n\n"
            sources.append(f"{match.get('document_name')} (p.{match.get('page')})")
            
    # Normally here we would send 'context' + 'req.query' to LLaMA/GPT via GROQ,
    # returning the synthesized answer and sources.
    # For now simply returning context.
    return {
        "context_found": bool(result.data),
        "raw_context": context,
        "sources": list(set(sources))
    }
