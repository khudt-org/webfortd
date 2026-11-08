import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Download, FileText } from "lucide-react"
import { filterLibraryItems, getLibraryItemBySlug } from "@/lib/library-catalog"
import { isCatalogItemVisible } from "@/lib/catalog-visibility"
import { getPreviewActive } from "@/lib/admin/preview"

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  // M3: published만 사전 렌더. draft slug는 on-demand + 런타임 게이트.
  return filterLibraryItems({}).map((item) => ({ slug: item.slug }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const item = getLibraryItemBySlug(slug)
  if (!item) return { title: "자료를 찾을 수 없습니다" }
  // M3 게이트: 비-admin에게 draft 자료의 메타데이터(제목/요약)도 노출하지 않음.
  const includeUnpublished = await getPreviewActive()
  if (!isCatalogItemVisible(item.status, includeUnpublished)) {
    return { title: "자료를 찾을 수 없습니다" }
  }
  return { title: item.title, description: item.summary }
}

export default async function LibraryItemPage({ params }: PageProps) {
  const { slug } = await params
  const item = getLibraryItemBySlug(slug)
  if (!item) notFound()
  // M3 게이트: draft 자료는 admin Draft Mode에서만 접근. 비-admin 직접 접근은 404.
  const includeUnpublished = await getPreviewActive()
  if (!isCatalogItemVisible(item.status, includeUnpublished)) {
    notFound()
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <Link
        href="/library"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        자료실 목록
      </Link>
      <header className="mb-6 flex items-start gap-4 border-b border-border pb-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10 text-primary">
          <FileText className="h-6 w-6" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{item.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {item.year}년 · {item.organization} · {item.fileSize}
          </p>
        </div>
      </header>
      <p className="mb-8 text-base text-foreground">{item.summary}</p>
      <a
        href={item.downloadUrl}
        download
        className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        원본 PDF 다운로드
      </a>
      {item.relatedAtomicAxis && item.relatedAtomicPrefix && (
        <section className="mt-10 rounded-md border border-border bg-muted/30 p-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">관련 atomic 페이지</h2>
          <p className="text-sm text-muted-foreground">
            이 자료는 위키의 atomic 페이지로 분해되어 있습니다. 위키에서{" "}
            <code className="rounded bg-muted px-1.5 py-0.5">/{item.relatedAtomicAxis}/{item.relatedAtomicPrefix}-*</code>{" "}
            슬러그로 시작하는 페이지들을 탐색하세요.
          </p>
        </section>
      )}
    </article>
  )
}
