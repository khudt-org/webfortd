import Foundation

/// 자료실 항목: 웹 src/lib/library-catalog.ts LIBRARY_ITEMS 미러(번들 library.json).
public struct LibraryItem: Codable, Equatable, Sendable, Identifiable {
    public let slug: String
    public let title: String
    public let year: Int
    public let organization: String
    public let category: String
    public let summary: String
    public let fileSize: String
    public let mimeType: String
    public let downloadUrl: String
    public let relatedAtomicAxis: String?
    public let relatedAtomicPrefix: String?
    public var id: String { slug }

    public init(
        slug: String,
        title: String,
        year: Int,
        organization: String,
        category: String,
        summary: String,
        fileSize: String,
        mimeType: String,
        downloadUrl: String,
        relatedAtomicAxis: String? = nil,
        relatedAtomicPrefix: String? = nil
    ) {
        self.slug = slug
        self.title = title
        self.year = year
        self.organization = organization
        self.category = category
        self.summary = summary
        self.fileSize = fileSize
        self.mimeType = mimeType
        self.downloadUrl = downloadUrl
        self.relatedAtomicAxis = relatedAtomicAxis
        self.relatedAtomicPrefix = relatedAtomicPrefix
    }
}

/// 미디어 항목: 웹 src/lib/media-curation.ts MEDIA_ITEMS 미러(번들 media.json).
public struct MediaItem: Codable, Equatable, Sendable, Identifiable {
    public let slug: String
    public let imagePath: String
    public let alt: String
    public let caption: String
    public let sourceDocSlug: String
    public let sourceDocTitle: String
    public let sourceAxis: String

    public var id: String { slug }

    public init(
        slug: String,
        imagePath: String,
        alt: String,
        caption: String,
        sourceDocSlug: String,
        sourceDocTitle: String,
        sourceAxis: String
    ) {
        self.slug = slug
        self.imagePath = imagePath
        self.alt = alt
        self.caption = caption
        self.sourceDocSlug = sourceDocSlug
        self.sourceDocTitle = sourceDocTitle
        self.sourceAxis = sourceAxis
    }
}

/// 번들 카탈로그 로더. KBStore와 동일한 Resources/KB 루트 사용.
/// 파라미터 없는 판은 앱 리소스에서 읽고(파이프라인 미실행 시 throw), `from:` 판은 테스트 주입용.
public enum CatalogStore {
    public static func libraryItems() throws -> [LibraryItem] { try decodeBundled("library.json") }
    public static func libraryItems(from url: URL) throws -> [LibraryItem] { try decode(from: url) }
    public static func mediaItems() throws -> [MediaItem] { try decodeBundled("media.json") }
    public static func mediaItems(from url: URL) throws -> [MediaItem] { try decode(from: url) }

    private static func decodeBundled<T: Decodable>(_ fileName: String) throws -> [T] {
        guard let root = Bundle.module.url(forResource: "KB", withExtension: nil) else {
            throw CatalogStoreError.bundleMissing
        }
        return try decode(from: root.appendingPathComponent(fileName))
    }

    private static func decode<T: Decodable>(from url: URL) throws -> [T] {
        try JSONDecoder().decode([T].self, from: Data(contentsOf: url))
    }
}

public enum CatalogStoreError: Error, Equatable {
    case bundleMissing
}
