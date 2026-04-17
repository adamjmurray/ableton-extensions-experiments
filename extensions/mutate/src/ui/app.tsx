import { render } from "preact";
import { getMutateData } from "./bridge.js";
import { ClipModeApp } from "./clip-mode-app.js";
import { SceneModeApp } from "./scene-mode-app.js";

function App() {
  const data = getMutateData();
  if (data.mode === "scene") return <SceneModeApp data={data} />;
  return <ClipModeApp data={data} />;
}

const mount = document.getElementById("app");
if (mount) {
  render(<App />, mount);
}
