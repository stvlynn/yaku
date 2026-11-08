import {
  PopupPage,
  SettingsPage,
  WorkspacePage,
  OnboardingPage,
} from "../pages";
import {
  useExtensionController,
  type Surface,
} from "../widgets/extension-controller";
import "../shared/styles/theme.css";

export function ExtensionApp({ surface }: { surface: Surface }) {
  const controller = useExtensionController(surface);
  if (surface === "popup") return <PopupPage {...controller.popup} />;
  if (surface === "options") return <SettingsPage {...controller.options} />;
  if (surface === "welcome") return <OnboardingPage {...controller.welcome} />;
  return <WorkspacePage {...controller.workspace} />;
}
