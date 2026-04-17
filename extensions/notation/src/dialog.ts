// Modal dialog orchestration. The dialog is opened in a loop so exports can
// round-trip through the extension host (write the file, open it, reopen the
// dialog). Errors from file writes or the `open` command are surfaced to the
// next iteration via an errorMessage banner in the payload.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { exec } from "node:child_process";

import notationInterface from "./notation.html";
import type { ClipInfo } from "./clip-utils.js";
import { escapeDialogPayload } from "./escape.js";

// initialize<"0.0.5">'s return type — the bound ExtensionContext shape. We
// only need a thin surface here, but naming it as an inline type keeps the
// dialog module decoupled from the full SDK type import.
export interface DialogHost {
  createModalDialog: () => { show: (url: string, width: number, height: number) => Promise<string> };
  environment: { tempDirectory: string | undefined };
}

export interface DialogDeps {
  context: DialogHost;
  notationInterface?: string; // override for tests; defaults to the imported template
  getMetadata: () => {
    tempo: number;
    rootNote: number;
    scaleName: string;
    timeSignature: { numerator: number; denominator: number };
  };
}

interface ExportAction {
  action: "export";
  data: string;
  filename: string;
  encoding: "utf8" | "base64";
}

interface CloseAction {
  action: "close";
}

type DialogResult = ExportAction | CloseAction;

// Modal dialog size. Wide enough for a 4-beat bar line to read comfortably at
// typical OSMD zoom; tall enough to show toolbar + ~4 systems before scroll.
const DIALOG_WIDTH = 1200;
const DIALOG_HEIGHT = 800;

function openFile(filePath: string): Promise<Error | null> {
  return new Promise((resolve) => {
    const platform = os.platform();
    const cmd = platform === "win32" ? "start" : "open";
    exec(`${cmd} "${filePath}"`, (err) => resolve(err));
  });
}

// Open the notation modal for the given clips and loop until the user closes
// it. Export actions write the file under `tempDirectory/notation-exports/`,
// open it with the system default application, then reopen the dialog.
// Write/open failures are surfaced on the next iteration via errorMessage.
export async function showNotationDialog(
  deps: DialogDeps,
  clips: ClipInfo[],
  emptyStateMessage?: string,
): Promise<void> {
  const metadata = deps.getMetadata();
  const template = deps.notationInterface ?? notationInterface;

  const exportDir = path.join(
    deps.context.environment.tempDirectory || os.tmpdir(),
    "notation-exports",
  );
  fs.mkdirSync(exportDir, { recursive: true });

  // Carried from one dialog iteration to the next. When an export fails
  // (write or open), the dialog closes, we surface the error in a banner
  // on the next iteration.
  let errorMessage: string | undefined;

  while (true) {
    const payload = JSON.stringify({
      clips,
      ...metadata,
      ...(emptyStateMessage ? { emptyStateMessage } : {}),
      ...(errorMessage ? { errorMessage } : {}),
    });

    const safePayload = escapeDialogPayload(payload);
    const html = template.replace(
      "</head>",
      `<script>window.__NOTATION_DATA__='${safePayload}';</script></head>`,
    );
    const dataUrl = `data:text/html,${encodeURIComponent(html)}`;

    let resultStr: string;
    try {
      const dialog = deps.context.createModalDialog();
      resultStr = await dialog.show(dataUrl, DIALOG_WIDTH, DIALOG_HEIGHT);
    } catch (e) {
      console.error("Notation: dialog failed to show:", e);
      break;
    }

    let result: DialogResult;
    try {
      result = JSON.parse(resultStr);
    } catch (e) {
      console.error("Notation: dialog returned unparseable result:", resultStr, e);
      break;
    }

    if (result.action === "close") break;

    // Clear any prior error; a new export attempt will set its own.
    errorMessage = undefined;
    const filePath = path.join(exportDir, result.filename);
    try {
      if (result.encoding === "base64") {
        fs.writeFileSync(filePath, Buffer.from(result.data, "base64"));
      } else {
        fs.writeFileSync(filePath, result.data, "utf-8");
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      console.error(`Notation: failed to write ${filePath}:`, e);
      errorMessage = `Couldn't save ${result.filename}: ${reason}`;
      continue;
    }

    console.log(`Notation: Exported to ${filePath}`);
    const openErr = await openFile(filePath);
    if (openErr) {
      const reason = openErr.message || String(openErr);
      console.error(`Notation: failed to open ${filePath}:`, openErr);
      errorMessage = `Saved ${result.filename}, but couldn't open it: ${reason}`;
    }
  }
}
