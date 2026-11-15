import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { ConnectorStatus } from '../extension/src/dto/ConnectorSession';
import type { Messages } from './i18n/messages';
import { useModalDialog } from './useModalDialog';

interface ConnectionDialogProps {
  issue: Exclude<ConnectorStatus, 'ready'>;
  open: boolean;
  onClose: () => void;
  onRetry: () => Promise<ConnectorStatus | undefined> | undefined;
  messages: Messages;
  privacyHref: string;
  languageControl: ReactNode;
}

export function ConnectionDialog({
  issue,
  open,
  onClose,
  onRetry,
  messages,
  privacyHref,
  languageControl,
}: ConnectionDialogProps) {
  const dialogRef = useModalDialog(open);
  const { connection } = messages;
  const { title, steps } = connection.issues[issue];
  const needsConsent = issue === 'consent-required';
  const [installOpen, setInstallOpen] = useState(false);
  const [retryState, setRetryState] = useState<ConnectorStatus | 'idle' | 'checking'>('idle');
  const checking = retryState === 'checking';

  function close() {
    setInstallOpen(false);
    setRetryState('idle');
    onClose();
  }

  function retry() {
    if (checking) return;
    const check = onRetry();
    if (!check) return;

    setRetryState('checking');
    void check.then((status) => {
      setRetryState((previous) =>
        previous === 'checking' ? (status === issue ? status : 'idle') : previous,
      );
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className="app-dialog connection-dialog"
      aria-labelledby="connection-title"
      aria-describedby="connection-description"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className="connection-dialog-body">
        <div className="connection-dialog-heading">
          <h2 id="connection-title">{title}</h2>
          {languageControl}
        </div>
        <p id="connection-description">{connection.description}</p>
        <ol className="connection-steps">
          {steps.map((step, index) => (
            <li key={step}>
              {step}
              {index === 0 && issue === 'connector-unavailable' && (
                <>
                  <button
                    type="button"
                    className="connection-disclosure"
                    aria-expanded={installOpen}
                    aria-controls="connection-install-instructions"
                    onClick={() => setInstallOpen((previous) => !previous)}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m6 4 4 4-4 4" />
                    </svg>
                    {connection.installHelp}
                  </button>
                  <div
                    id="connection-install-instructions"
                    className="connection-install"
                    aria-hidden={!installOpen}
                  >
                    <div className="connection-install-inner">
                      <p>{connection.install}</p>
                    </div>
                  </div>
                </>
              )}
              {index === 0 && (issue === 'signed-out' || issue === 'duolingo-unavailable') && (
                <>
                  {' '}
                  <a href="https://www.duolingo.com/" target="_blank" rel="noopener noreferrer">
                    {connection.openDuolingo}
                  </a>
                </>
              )}
            </li>
          ))}
        </ol>
        {needsConsent && (
          <Link className="dialog-privacy-link" to={privacyHref}>
            {messages.privacy}
          </Link>
        )}
      </div>
      {!needsConsent && (
        <p className="connection-retry-feedback" role="status">
          {retryState === issue ? connection.stillUnavailable : ''}
        </p>
      )}
      <div className="connection-dialog-actions">
        <button type="button" className="secondary-button" onClick={close}>
          {messages.close}
        </button>
        {needsConsent ? (
          <Link className="primary-button information-button" to="/access/">
            {messages.manageAccess}
          </Link>
        ) : (
          <button
            type="button"
            className="primary-button"
            aria-disabled={checking}
            aria-busy={checking}
            onClick={retry}
          >
            {checking ? connection.retrying : connection.retry}
          </button>
        )}
      </div>
    </dialog>
  );
}
