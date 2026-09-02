// ---------------------------------------------------------------------------
// Action-item state shared by the main process and the renderer. An item is
// "open" when it is not done, not dismissed, and not snoozed into the future.
// Dismissed means it was never really a task (or not yours); done means it was
// and it got done. Keeping them apart keeps the done list honest.
// ---------------------------------------------------------------------------

export interface ActionState {
  done?: boolean
  dismissed?: boolean
  /** ISO date; hidden from open lists until this day arrives */
  snoozedUntil?: string | null
}

export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`
}

export function isSnoozed(item: ActionState, today: string = todayIso()): boolean {
  return !!item.snoozedUntil && item.snoozedUntil > today
}

export function isOpenAction(item: ActionState, today: string = todayIso()): boolean {
  return !item.done && !item.dismissed && !isSnoozed(item, today)
}
