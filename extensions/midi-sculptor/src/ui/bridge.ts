// Communication between webview and extension host

declare global {
  interface Window {
    webkit?: { messageHandlers?: { live?: { postMessage(msg: unknown): void } } };
    chrome?: { webview?: { postMessage(msg: unknown): void } };
    __SCULPTOR_NOTES__?: string;
    __SCULPTOR_CLIP__?: string;
  }
}

function doSendMessage(message: unknown) {
  if (window.webkit?.messageHandlers?.live) {
    window.webkit.messageHandlers.live.postMessage(message);
  } else if (window.chrome?.webview) {
    window.chrome.webview.postMessage(message);
  }
}

export function closeWithResult(result: unknown) {
  console.log("[bridge] closeWithResult called:", result);
  const message = { name: "close_and_send", args: [JSON.stringify(result)] };
  console.log("[bridge] sending message:", message);
  doSendMessage(message);
  console.log("[bridge] message sent");
}

export function getInitialNotes(): Array<Record<string, unknown>> {
  try {
    return JSON.parse(window.__SCULPTOR_NOTES__ || "[]");
  } catch {
    return [];
  }
}

export function getClipInfo(): { start: number; end: number; length: number } {
  try {
    return JSON.parse(window.__SCULPTOR_CLIP__ || '{"start":0,"end":16,"length":16}');
  } catch {
    return { start: 0, end: 16, length: 16 };
  }
}
