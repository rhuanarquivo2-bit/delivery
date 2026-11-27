import { fixedIcon, manifestIcons } from "@/lib/push/app-icon";

/** Manifesto da tela da cozinha: abre em tela cheia, deitada, como app no tablet. */
export function kitchenManifest(path: string) {
  return {
    name: "Cozinha",
    short_name: "Cozinha",
    id: path,
    start_url: path,
    scope: path,
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#09090b",
    theme_color: "#09090b",
    lang: "pt-BR",
    icons: manifestIcons((size) => fixedIcon("painel", size)),
  };
}
