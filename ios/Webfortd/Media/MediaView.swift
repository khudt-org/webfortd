import SwiftUI
import WebfortdKit

/// 미디어: 큐레이션 이미지 목록. 이미지 accessibilityLabel = alt(전문, RemoteImageView가 처리),
/// 캡션은 별도 텍스트(alt는 이미지 서술, 캡션은 큐레이션 문구. 중복 아님).
struct MediaView: View {
    let items: [MediaItem]?

    var body: some View {
        Group {
            if let items, items.isEmpty {
                // 3-state: 비어 있음은 실패와 다른 문구로(번들은 있으나 항목 0건).
                ContentUnavailableView("아직 등록된 미디어가 없습니다", systemImage: "tray")
            } else if let items {
                List(items) { item in
                    row(item)
                }
            } else {
                // 3-state: 번들 결함은 "미디어 0건"이 아니라 실패로 알린다.
                ContentUnavailableView(
                    "미디어를 불러오지 못했습니다",
                    systemImage: "exclamationmark.triangle",
                    description: Text("앱 콘텐츠 번들이 없습니다. 개발 중이라면 node ios/scripts/bundle-content.mjs 실행 후 다시 빌드하세요."))
            }
        }
        .navigationTitle("미디어")
    }

    @ViewBuilder
    private func row(_ item: MediaItem) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            RemoteImageView(url: URL(string: item.imagePath, relativeTo: AppConfig.webBaseURL), alt: item.alt)
            Text(item.caption)
                .font(.subheadline)
            // 출처 문서로 push(미디어 탭 NavigationStack의 공용 destination 사용).
            // 44pt frame은 label 안쪽 + contentShape(바깥 frame은 히트 영역을 안 넓힌다)
            NavigationLink(value: AppRoute.document(slug: item.sourceDocSlug)) {
                Text("출처: \(item.sourceDocTitle)")
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
        }
        .padding(.vertical, 4)
    }
}
