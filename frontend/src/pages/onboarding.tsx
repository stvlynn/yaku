import {
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Languages,
  LockKeyhole,
} from "lucide-react";
import type { ModelStatus } from "../entities/translation";
import {
  LanguagePreferences,
  type PreferencesProps,
} from "../features/preferences";
import { copy } from "../shared/i18n";
import {
  Brand,
  Button,
  IconButton,
  ModelStatusView,
  Notice,
} from "../shared/ui";

export type OnboardingStep = "welcome" | "model" | "try" | "done";
export interface OnboardingPageProps extends PreferencesProps {
  step: OnboardingStep;
  status: ModelStatus;
  source: string;
  result: string;
  onSourceChange: (value: string) => void;
  onTranslate: () => void;
  onPrepareModel: () => void;
  onCancelDownload: () => void;
  onContinue: () => void;
  onBack: () => void;
  onFinish: () => void;
  canContinue: boolean;
  error?: string;
}

export function OnboardingPage(props: OnboardingPageProps) {
  const steps: OnboardingStep[] = ["welcome", "model", "try", "done"];
  const busy = ["downloading", "loading", "translating"].includes(
    props.status.phase,
  );
  const titles = {
    welcome: copy.welcomeTitle,
    model: copy.modelSetupTitle,
    try: copy.tryTitle,
    done: copy.finishTitle,
  };
  const descriptions = {
    welcome: copy.welcomeDescription,
    model: copy.modelSetupDescription,
    try: copy.tryDescription,
    done: copy.finishDescription,
  };
  return (
    <div className="onboarding-page">
      <aside className="onboarding-story">
        <Brand compact />
        <div
          className="onboarding-art"
          role="img"
          aria-label={copy.welcomeArtworkLabel}
        >
          <Languages size={44} strokeWidth={1.2} aria-hidden="true" />
          <div className="sample-source">{copy.trySample}</div>
          <div className="sample-result" lang="zh">
            {copy.sampleTranslation}
          </div>
        </div>
        <div className="onboarding-note">
          <LockKeyhole size={16} />
          <div>
            <h2>{copy.welcomeLocal}</h2>
            <p>{copy.welcomeLocalDescription}</p>
          </div>
        </div>
      </aside>
      <main className="onboarding-main">
        <div className="onboarding-content">
          <div className="onboarding-topline">
            {props.step !== "welcome" && props.step !== "done" && (
              <IconButton
                label={copy.back}
                disabled={busy}
                onClick={props.onBack}
              >
                <ArrowLeft size={17} />
              </IconButton>
            )}
            <div
              className="setup-progress"
              role="img"
              aria-label={copy.stepLabel}
            >
              {steps.map((step) => (
                <span
                  key={step}
                  className={
                    steps.indexOf(step) <= steps.indexOf(props.step)
                      ? "complete"
                      : ""
                  }
                />
              ))}
            </div>
          </div>
          <header className="onboarding-heading">
            <h1>{titles[props.step]}</h1>
            <p>{descriptions[props.step]}</p>
          </header>
          {props.step === "model" && (
            <div className="onboarding-setup">
              <LanguagePreferences
                preferences={props.preferences}
                onPreferencesChange={props.onPreferencesChange}
                compact
              />
              <div className="onboarding-model">
                <ModelStatusView status={props.status} detail />
                {props.status.phase !== "ready" && (
                  <p>{copy.modelDownloadDetail}</p>
                )}
                {["idle", "error"].includes(props.status.phase) && (
                  <Button variant="primary" onClick={props.onPrepareModel}>
                    <Download size={16} />
                    {props.status.phase === "error"
                      ? copy.retry
                      : copy.downloadModel}
                  </Button>
                )}
                {["downloading", "loading"].includes(props.status.phase) && (
                  <Button onClick={props.onCancelDownload}>
                    {copy.cancelDownload}
                  </Button>
                )}
                {props.status.phase === "ready" && (
                  <p className="onboarding-ready">
                    <Check size={15} />
                    {copy.modelReadyContinue}
                  </p>
                )}
              </div>
            </div>
          )}
          {props.step === "try" && (
            <div className="onboarding-practice">
              <label htmlFor="practice-input" className="field-label">
                {copy.sourceText}
              </label>
              <textarea
                id="practice-input"
                className="input"
                value={props.source}
                readOnly={busy}
                onChange={(event) => props.onSourceChange(event.target.value)}
                placeholder={copy.sourcePlaceholder}
              />
              <Button
                onClick={props.onTranslate}
                disabled={busy || !props.source.trim()}
              >
                <Languages size={16} />
                {busy ? copy.translating : copy.translate}
              </Button>
              {props.result && (
                <div className="practice-result" role="status">
                  <span className="field-label">{copy.resultText}</span>
                  <p>{props.result}</p>
                </div>
              )}
            </div>
          )}
          {(props.error || props.status.error) && (
            <Notice>{props.error || props.status.error}</Notice>
          )}
          <footer className="onboarding-footer">
            <Button
              variant="primary"
              disabled={props.step !== "done" && !props.canContinue}
              onClick={
                props.step === "done" ? props.onFinish : props.onContinue
              }
            >
              {props.step === "welcome"
                ? copy.getStarted
                : props.step === "done"
                  ? copy.finish
                  : copy.continue}
              <ArrowRight size={16} />
            </Button>
          </footer>
        </div>
      </main>
    </div>
  );
}
