from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
import os
import json

router = APIRouter()
# We will read this from env or use a static fallback if not provided
# Ideally set GROQ_API_KEY in .env

class OCRRequest(BaseModel):
    image_base64: str

@router.post("/parse_schedule")
async def parse_schedule(req: OCRRequest):
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured on the server")

    prompt = """
    Analyze this image of a school schedule. Extract the data into a strict JSON format.
    Do not output any markdown formatting, only the raw JSON.
    The JSON structure MUST be a list of objects exactly like this, translating Russian if applicable, and keeping standard fields:
    [
      {
        "subject": "String (e.g. Алгебра, Геометрия. DO NOT include 'Классный час' unless it is clearly meant as a subject)",
        "teacher": "String (Name if available, else empty string)",
        "room": "String (Room number/name if available, else empty string)",
        "start_time": "String (HH:MM or empty)",
        "end_time": "String (HH:MM or empty)",
        "notes": "String",
        "materials": []
      }
    ]
    Fix any obvious typos in Russian subjects.
    """
    
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "llama-3.2-90b-vision-preview",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/jpeg;base64,{req.image_base64}"
                        }
                    }
                ]
            }
        ],
        "temperature": 0.1
    }
    
    async with httpx.AsyncClient(timeout=45.0) as client:
        resp = await client.post("https://api.groq.com/openai/v1/chat/completions", json=payload, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Vision API error. GROQ responded with: {resp.text}")
            
        content = resp.json()["choices"][0]["message"]["content"]
        
        # Clean markdown wrappers if any
        content = content.replace("```json", "").replace("```", "").strip()
        try:
            parsed = json.loads(content)
            return {"lessons": parsed}
        except json.JSONDecodeError:
            return {"lessons": [], "error": "Failed to parse JSON", "raw": content}

