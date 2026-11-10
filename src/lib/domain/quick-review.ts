export type QuickReviewMode = "en-zh" | "zh-en";
export type QuickReviewFeedback = "correct" | "wrong" | null;

export interface QuickReviewState {
  mode: QuickReviewMode | null;
  completedIds: string[];
  activeId: string | null;
  feedback: QuickReviewFeedback;
}

export type QuickReviewAction =
  | { type: "choose-mode"; mode: QuickReviewMode; completedIds: string[] }
  | { type: "wrong"; phraseId: string }
  | { type: "correct"; phraseId: string }
  | { type: "next" }
  | { type: "restart" }
  | { type: "back-to-modes" };

export const INITIAL_QUICK_REVIEW_STATE: QuickReviewState = {
  mode: null,
  completedIds: [],
  activeId: null,
  feedback: null,
};

export function quickReviewReducer(
  state: QuickReviewState,
  action: QuickReviewAction,
): QuickReviewState {
  if (action.type === "choose-mode") {
    return {
      mode: action.mode,
      completedIds: [...new Set(action.completedIds)],
      activeId: null,
      feedback: null,
    };
  }
  if (action.type === "wrong") {
    return {
      ...state,
      activeId: action.phraseId,
      feedback: "wrong",
    };
  }
  if (action.type === "correct") {
    if (state.completedIds.includes(action.phraseId)) return state;
    return {
      ...state,
      completedIds: [...state.completedIds, action.phraseId],
      feedback: "correct",
    };
  }
  if (action.type === "next") {
    return {
      ...state,
      activeId: null,
      feedback: null,
    };
  }
  if (action.type === "restart") {
    return {
      ...state,
      completedIds: [],
      activeId: null,
      feedback: null,
    };
  }
  return {
    ...state,
    mode: null,
    activeId: null,
    feedback: null,
  };
}
