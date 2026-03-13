import { tauriInvoke } from './tauri-bridge'

export interface RoadmapExport {
  name: string
  desc: string
  nodes: any[]
  edges: any[]
}

export async function exportRoadmapToMarkdown(roadmap: RoadmapExport) {
  let md = `# Roadmap: ${roadmap.name}\n\n`
  md += `${roadmap.desc}\n\n`
  md += `## Nodes\n\n`
  
  roadmap.nodes.forEach(node => {
    md += `### ${node.title} [${node.status}]\n`
    md += `- **ID**: ${node.id}\n`
    md += `- **Tags**: ${node.tags.join(', ')}\n`
    md += `- **Assignees**: ${node.assignees.join(', ')}\n`
    if (node.desc) md += `\n${node.desc}\n`
    if (node.mdContent) md += `\n#### Content\n${node.mdContent}\n`
    md += `\n---\n\n`
  })

  md += `## Connections\n\n`
  roadmap.edges.forEach(edge => {
    const from = roadmap.nodes.find(n => n.id === edge.from)?.title || edge.from
    const to = roadmap.nodes.find(n => n.id === edge.to)?.title || edge.to
    md += `- ${from} → ${to}\n`
  })

  // In a real scenario, we might generate an SVG string here
  md += `\n\n> Exported from veyo.ai on ${new Date().toLocaleDateString()}\n`

  try {
    // This would call a Tauri command to save the file
    // await tauriInvoke('save_file', { contents: md, filename: `${roadmap.name}.md` })
    console.log("Markdown generated:", md)
    return md
  } catch (err) {
    console.error("Export failed:", err)
    throw err
  }
}
