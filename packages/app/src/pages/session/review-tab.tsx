import { createEffect, on, onCleanup, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import type { FileDiff } from "@opencode-ai/sdk/v2"
import { SessionReview } from "@opencode-ai/ui/session-review"
import type { SelectedLineRange } from "@/context/file"
import { useSDK } from "@/context/sdk"
import { useLayout } from "@/context/layout"
import type { LineComment } from "@/context/comments"

export type DiffStyle = "unified" | "split"

export interface SessionReviewTabProps {
  title?: JSX.Element
  empty?: JSX.Element
  diffs: () => FileDiff[]
  view: () => ReturnType<ReturnType<typeof useLayout>["view"]>
  diffStyle: DiffStyle
  onDiffStyleChange?: (style: DiffStyle) => void
  onViewFile?: (file: string) => void
  onLineComment?: (comment: { file: string; selection: SelectedLineRange; comment: string; preview?: string }) => void
  comments?: LineComment[]
  focusedComment?: { file: string; id: string } | null
  onFocusedCommentChange?: (focus: { file: string; id: string } | null) => void
  focusedFile?: string
  onScrollRef?: (el: HTMLDivElement) => void
  classes?: {
    root?: string
    header?: string
    container?: string
  }
}

export function StickyAddButton(props: { children: JSX.Element }) {
  const [state, setState] = createStore({ stuck: false })
  let button: HTMLDivElement | undefined

  createEffect(() => {
    const node = button
    if (!node) return

    const scroll = node.parentElement
    if (!scroll) return

    const handler = () => {
      const rect = node.getBoundingClientRect()
      const scrollRect = scroll.getBoundingClientRect()
      setState("stuck", rect.right >= scrollRect.right && scroll.scrollWidth > scroll.clientWidth)
    }

    scroll.addEventListener("scroll", handler, { passive: true })
    const observer = new ResizeObserver(handler)
    observer.observe(scroll)
    handler()
    onCleanup(() => {
      scroll.removeEventListener("scroll", handler)
      observer.disconnect()
    })
  })

  return (
    <div
      ref={button}
      class="bg-background-base h-full shrink-0 sticky right-0 z-10 flex items-center justify-center border-b border-border-weak-base px-3"
      classList={{ "border-l": state.stuck }}
    >
      {props.children}
    </div>
  )
}

export function SessionReviewTab(props: SessionReviewTabProps) {
  let scroll: HTMLDivElement | undefined
  let restoreFrame: number | undefined
  let userInteracted = false

  const sdk = useSDK()
  const layout = useLayout()

  const readFile = async (path: string) => {
    return sdk.client.file
      .read({ path })
      .then((x) => x.data)
      .catch((error) => {
        console.debug("[session-review] failed to read file", { path, error })
        return undefined
      })
  }

  const handleInteraction = () => {
    userInteracted = true
  }

  const doRestore = () => {
    restoreFrame = undefined
    const el = scroll
    if (!el || !layout.ready() || userInteracted) return
    if (el.clientHeight === 0 || el.clientWidth === 0) return

    const s = props.view().scroll("review")
    if (!s || (s.x === 0 && s.y === 0)) return

    const maxY = Math.max(0, el.scrollHeight - el.clientHeight)
    const maxX = Math.max(0, el.scrollWidth - el.clientWidth)

    const targetY = Math.min(s.y, maxY)
    const targetX = Math.min(s.x, maxX)

    if (el.scrollTop !== targetY) el.scrollTop = targetY
    if (el.scrollLeft !== targetX) el.scrollLeft = targetX
  }

  const queueRestore = () => {
    if (userInteracted || restoreFrame !== undefined) return
    restoreFrame = requestAnimationFrame(doRestore)
  }

  const handleScroll = (event: Event & { currentTarget: HTMLDivElement }) => {
    if (!layout.ready() || !userInteracted) return

    const el = event.currentTarget
    if (el.clientHeight === 0 || el.clientWidth === 0) return

    props.view().setScroll("review", {
      x: el.scrollLeft,
      y: el.scrollTop,
    })
  }

  createEffect(
    on(
      () => props.diffs().length,
      () => queueRestore(),
      { defer: true },
    ),
  )

  createEffect(
    on(
      () => props.diffStyle,
      () => queueRestore(),
      { defer: true },
    ),
  )

  createEffect(
    on(
      () => layout.ready(),
      (ready) => {
        if (!ready) return
        queueRestore()
      },
      { defer: true },
    ),
  )

  onCleanup(() => {
    if (restoreFrame !== undefined) cancelAnimationFrame(restoreFrame)
    if (scroll) {
      scroll.removeEventListener("wheel", handleInteraction)
      scroll.removeEventListener("pointerdown", handleInteraction)
      scroll.removeEventListener("touchstart", handleInteraction)
      scroll.removeEventListener("keydown", handleInteraction)
    }
  })

  return (
    <SessionReview
      title={props.title}
      empty={props.empty}
      scrollRef={(el) => {
        scroll = el
        el.addEventListener("wheel", handleInteraction, { passive: true, capture: true })
        el.addEventListener("pointerdown", handleInteraction, { passive: true, capture: true })
        el.addEventListener("touchstart", handleInteraction, { passive: true, capture: true })
        el.addEventListener("keydown", handleInteraction, { passive: true, capture: true })
        props.onScrollRef?.(el)
        queueRestore()
      }}
      onScroll={handleScroll}
      onDiffRendered={queueRestore}
      open={props.view().review.open()}
      onOpenChange={props.view().review.setOpen}
      classes={{
        root: props.classes?.root ?? "pb-6 pr-3",
        header: props.classes?.header ?? "px-3",
        container: props.classes?.container ?? "pl-3",
      }}
      diffs={props.diffs()}
      diffStyle={props.diffStyle}
      onDiffStyleChange={props.onDiffStyleChange}
      onViewFile={props.onViewFile}
      focusedFile={props.focusedFile}
      readFile={readFile}
      onLineComment={props.onLineComment}
      comments={props.comments}
      focusedComment={props.focusedComment}
      onFocusedCommentChange={props.onFocusedCommentChange}
    />
  )
}
