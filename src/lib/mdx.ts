import fs from "fs"
import path from "path"
import matter from "gray-matter"
import { cache } from "react"

const CONTENT_DIR = path.join(process.cwd(), "content")

export interface DocMeta {
  slug: string
  title: string
  description?: string
  date?: string
  author?: string
  category?: string
  tags?: string[]
}

// 특정 디렉토리의 모든 문서 가져오기
export const getAllDocs = cache(async (section: string, subsection?: string): Promise<DocMeta[]> => {
  const dirPath = subsection
    ? path.join(CONTENT_DIR, section, subsection)
    : path.join(CONTENT_DIR, section)

  if (!fs.existsSync(dirPath)) {
    return []
  }

  const files = fs.readdirSync(dirPath).filter((file) => file.endsWith(".mdx") || file.endsWith(".md"))

  const docs: DocMeta[] = files.map((file) => {
    const filePath = path.join(dirPath, file)
    const fileContent = fs.readFileSync(filePath, "utf-8")
    const { data } = matter(fileContent)
    const slug = file.replace(/\.(mdx|md)$/, "")

    return {
      slug,
      title: data.title || slug,
      description: data.description,
      date: data.date,
      author: data.author,
      category: data.category,
      tags: data.tags,
    }
  })

  // 날짜 기준 정렬 (최신순)
  return docs.sort((a, b) => {
    if (a.date && b.date) {
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    }
    return 0
  })
})
