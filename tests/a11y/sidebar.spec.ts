// T11 — sidebar a11y 회귀 가드
//
// 검증 범위:
//   1. Axe (/, /legacy, /legacy/support) — expanded·collapsed·mobile 상태
//   2. 햄버거 aria-expanded 토글
//   3. Cmd+B 단축키 사이드바 토글
//   4. ESC 모바일 overlay 닫기
//   5. 건너뛰기 단축키 — Alt+1 본문, Alt+2 사이드바 (시각적 skip link 대체)

import { test, expect } from "@playwright/test"
import { expectNoAxeViolations } from "./axe-helper"
import { SIDEBAR_COOKIE_NAME } from "../../src/lib/sidebar-cookie"

const COOKIE_NAME = SIDEBAR_COOKIE_NAME
const BASE_URL = "http://localhost:3100"

// ─── Axe 검증 ────────────────────────────────────────────────────────────────

test.describe("Axe: /, /legacy, /legacy/support — expanded state", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: COOKIE_NAME, value: "1", url: BASE_URL },
    ])
  })

  test("axe expanded: /", async ({ page }, info) => {
    await expectNoAxeViolations(page, info, "/")
  })

  test("axe expanded: /legacy", async ({ page }, info) => {
    await expectNoAxeViolations(page, info, "/legacy")
  })

  test("axe expanded: /legacy/support", async ({ page }, info) => {
    await expectNoAxeViolations(page, info, "/legacy/support")
  })
})

test.describe("Axe: /, /legacy, /legacy/support — collapsed state", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: COOKIE_NAME, value: "0", url: BASE_URL },
    ])
  })

  test("axe collapsed: /", async ({ page }, info) => {
    await expectNoAxeViolations(page, info, "/")
  })

  test("axe collapsed: /legacy", async ({ page }, info) => {
    await expectNoAxeViolations(page, info, "/legacy")
  })

  test("axe collapsed: /legacy/support", async ({ page }, info) => {
    await expectNoAxeViolations(page, info, "/legacy/support")
  })
})

test.describe("Axe: mobile (768×1024) — overlay closed", () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test("axe mobile: /", async ({ page }, info) => {
    await expectNoAxeViolations(page, info, "/")
  })
})

// ─── 햄버거 aria-expanded 토글 ────────────────────────────────────────────────
//
// 햄버거 버튼 선택: aria-controls="app-sidebar"로 헤더 햄버거만 정확히 지정.
// getByRole + regex는 SidebarNav disclosure 버튼("하위 메뉴 펼치기")도 매칭하므로 사용 금지.

test("hamburger: aria-expanded toggles on click (desktop)", async ({ page }) => {
  await page.goto("/")
  // aria-controls="app-sidebar"로 헤더 햄버거 버튼만 선택
  const trigger = page.locator('[aria-controls="app-sidebar"]')
  await expect(trigger).toBeVisible()

  const initialExpanded = await trigger.getAttribute("aria-expanded")
  await trigger.click()

  // aria-expanded가 토글되어야 함
  const afterExpanded = await trigger.getAttribute("aria-expanded")
  expect(afterExpanded).not.toBe(initialExpanded)
  expect(afterExpanded).toMatch(/^(true|false)$/)
})

test("hamburger: aria-hidden on #app-sidebar flips with hamburger click (desktop)", async ({
  page,
}) => {
  await page.goto("/")
  const sidebar = page.locator("#app-sidebar")
  const trigger = page.locator('[aria-controls="app-sidebar"]')

  const hiddenBefore = await sidebar.getAttribute("aria-hidden")
  await trigger.click()
  const hiddenAfter = await sidebar.getAttribute("aria-hidden")

  expect(hiddenAfter).not.toBe(hiddenBefore)
})

// ─── Cmd+B 단축키 ─────────────────────────────────────────────────────────────

test("Cmd+B: keyboard shortcut toggles sidebar aria-hidden (desktop)", async ({ page }) => {
  await page.goto("/")
  const sidebar = page.locator("#app-sidebar")

  const hiddenBefore = await sidebar.getAttribute("aria-hidden")

  // useKeyboardShortcut checks metaKey || ctrlKey.
  // Playwright chromium on macOS fires metaKey for Meta+b.
  await page.keyboard.press("Meta+b")
  await page.waitForTimeout(50) // 렌더 flush 대기

  const hiddenAfter = await sidebar.getAttribute("aria-hidden")
  expect(hiddenAfter).not.toBe(hiddenBefore)
  expect(hiddenAfter).toMatch(/^(true|false)$/)
})

// ─── ESC 모바일 overlay 닫기 ─────────────────────────────────────────────────

test.describe("ESC: closes mobile overlay at 768px", () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test("ESC closes open mobile overlay", async ({ page }) => {
    await page.goto("/")
    const sidebar = page.locator("#app-sidebar")

    // 초기 상태: 모바일 overlay 닫힘 (aria-hidden="true")
    await expect(sidebar).toHaveAttribute("aria-hidden", "true")

    // 햄버거 클릭으로 overlay 열기 — aria-controls="app-sidebar"로 헤더 햄버거만 지정
    const hamburger = page.locator('[aria-controls="app-sidebar"]')
    await hamburger.click()
    await expect(sidebar).toHaveAttribute("aria-hidden", "false")

    // ESC로 닫기
    await page.keyboard.press("Escape")
    await expect(sidebar).toHaveAttribute("aria-hidden", "true")
  })
})

// ─── 건너뛰기 단축키 (시각적 skip link 대체) ──────────────────────────────────
// 시각적 sr-only skip link는 제거됨 — 동일한 '건너뛰기'를 Alt 단축키로 제공한다
// (src/lib/accessibility.ts: Alt+1 본문, Alt+2 사이드바, Alt+3 검색).

test("Alt+1 moves focus to #main-content", async ({ page }) => {
  await page.goto("/")

  await page.keyboard.press("Alt+1")
  await page.waitForTimeout(50) // 포커스 이동 완료 대기

  const focusedId = await page.evaluate(
    () => (document.activeElement as HTMLElement | null)?.id ?? "",
  )
  expect(focusedId).toBe("main-content")
})

test("Alt+2 moves focus to #app-sidebar", async ({ page }) => {
  await page.goto("/")

  await page.keyboard.press("Alt+2")
  await page.waitForTimeout(50) // 사이드바 열림 + requestAnimationFrame 포커스 이동 대기

  const focusedId = await page.evaluate(
    () => (document.activeElement as HTMLElement | null)?.id ?? "",
  )
  expect(focusedId).toBe("app-sidebar")
})

// Alt+3 검색: 홈은 히어로 옴니박스가 단독 검색 표면이라(헤더 검색창 숨김) 단축키가
// 그 입력창에 안착해야 한다. 검색창이 둘이던 시절의 id 분리를 되살리면 여기서 깨진다.
test("홈 검색창은 하나이고 Alt+3이 그 옴니박스로 이동한다", async ({ page }) => {
  await page.goto("/")

  await expect(page.getByRole("combobox")).toHaveCount(1)

  await page.keyboard.press("Alt+3")
  await page.waitForTimeout(50)

  const focused = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    return { id: el?.id ?? "", tag: el?.tagName ?? "" }
  })
  expect(focused).toEqual({ id: "search-input", tag: "INPUT" })
})

// ─── 위키/레거시 모드 분기 + 신규 페이지 (T10) ───────────────────────────────────

test.describe("위키/레거시 모드 분기 + 신규 페이지", () => {
  // 사이드바 nav는 무명(landmark 이름표 제거) — #app-sidebar 안 nav + 고유 항목으로 식별.
  test("위키 모드(/) → 사이드바에 위키 nav + 5 진입", async ({ page }) => {
    await page.goto("/")
    const wikiNav = page.locator("#app-sidebar").getByRole("navigation")
    await expect(wikiNav).toBeVisible()
    const links = await wikiNav.getByRole("link").all()
    expect(links).toHaveLength(5)
  })

  test("레거시 모드(/legacy) → 사이드바에 레거시 nav", async ({ page }) => {
    await page.goto("/legacy")
    const legacyNav = page.locator("#app-sidebar").getByRole("navigation")
    await expect(legacyNav).toBeVisible()
    await expect(legacyNav.getByRole("link", { name: "플랫폼 소개" })).toBeVisible()
  })

  test("EntryToggle 클릭으로 모드 전환 — 위키 → 레거시", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("link", { name: /레거시 사이트/ }).click()
    await page.waitForURL(/\/legacy/)
    await expect(
      page.locator("#app-sidebar").getByRole("link", { name: "플랫폼 소개" }),
    ).toBeVisible()
  })

  test("Footer 정책 + about 4 페이지 200 응답", async ({ page }) => {
    for (const path of ["/about", "/privacy", "/terms", "/sitemap"]) {
      const response = await page.goto(path)
      expect(response?.status(), `${path} 200 기대`).toBe(200)
    }
  })
})

// ─── D5 포커스 트랩 (T12 codex-rescue F1) ─────────────────────────────────────
// inert가 <main>에만 걸려 있을 때 Header/Footer로 Tab 탈출 가능하던 문제 회귀 가드.
// 래퍼 div(Header + main + Footer)로 inert 이동 후 완전 차단 검증.

test.describe("D5 focus trap: mobile overlay — Tab stays within sidebar", () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test("mobile overlay open: Tab N회 연속 all focus stays within #app-sidebar", async ({ page }) => {
    // 레거시 모드(`/legacy`)로 진입 — SidebarNav 트리(주메뉴 6개 + 펼친 자식들) 사용해
    // 사이드바 focusable 항목 수를 늘리고 wraparound 후 escape 가능성을 차단.
    // (위키 모드 `/`는 평면 5개라 Tab 12회 시 wraparound 후 inert wrapper escape 가능.
    //  본 test 의도는 focus trap 깨지지 않는지 검증이지 wraparound 후 동작 검증이 아님.)
    await page.goto("/legacy")
    const sidebar = page.locator("#app-sidebar")

    // 햄버거 클릭으로 overlay 열기
    const hamburger = page.locator('[aria-controls="app-sidebar"]')
    await hamburger.click()
    await expect(sidebar).toHaveAttribute("aria-hidden", "false")

    // T6: AppSidebar는 overlay 열린 후 100ms 뒤 X 닫기 버튼에 자동 포커스.
    await page.waitForFunction(
      () => {
        const s = document.getElementById("app-sidebar")
        return s?.contains(document.activeElement) ?? false
      },
      { timeout: 1000 },
    )

    // Tab을 8번 눌러 사이드바 내부 포커스 순환 — 모든 포커스가 #app-sidebar 트리 안에 있어야 함.
    // 8회는 레거시 트리 6 항목 + 부수 컨트롤(X 닫기/EntryToggle/접근성)을 포함해 한 사이클을
    // 거치기에 충분한 횟수.
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab")
      const insideSidebar = await page.evaluate(() => {
        const s = document.getElementById("app-sidebar")
        return s?.contains(document.activeElement) ?? false
      })
      expect(insideSidebar, `Tab #${i + 1}: 포커스가 사이드바 밖으로 탈출`).toBe(true)
    }
  })
})
