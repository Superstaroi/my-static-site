import React, { useCallback, useEffect, useRef, useState } from 'react';
import './auth-shell.css';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  topCenterText?: string;
  usernameLabel: string;
  passwordLabel: string;
  rememberLabel: string;
  submitLabel: string;
  username: string;
  password: string;
  remember: boolean;
  submitting: boolean;
  error: string;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onRememberChange: (value: boolean) => void;
  onSubmit: (event: React.FormEvent) => void;
}

export const AuthShell: React.FC<AuthShellProps> = ({
  title,
  subtitle,
  topCenterText,
  usernameLabel,
  passwordLabel,
  rememberLabel,
  submitLabel,
  username,
  password,
  remember,
  submitting,
  error,
  onUsernameChange,
  onPasswordChange,
  onRememberChange,
  onSubmit,
}) => {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [passwordMode, setPasswordMode] = useState(false);

  const getPupils = useCallback(() => {
    if (!shellRef.current) {
      return [];
    }

    return Array.from(shellRef.current.querySelectorAll<SVGCircleElement>('.pupil'));
  }, []);

  const setNormalLook = useCallback(() => {
    getPupils().forEach(pupil => {
      const eyeX = Number.parseFloat(pupil.dataset.eyeX || '0');
      const eyeY = Number.parseFloat(pupil.dataset.eyeY || '0');
      pupil.setAttribute('cx', String(eyeX + 2.4));
      pupil.setAttribute('cy', String(eyeY));
      pupil.style.opacity = '1';
    });
  }, [getPupils]);

  const setPasswordLook = useCallback(() => {
    getPupils().forEach(pupil => {
      const eyeX = Number.parseFloat(pupil.dataset.eyeX || '0');
      const eyeY = Number.parseFloat(pupil.dataset.eyeY || '0');
      pupil.setAttribute('cx', String(eyeX - 3));
      pupil.setAttribute('cy', String(eyeY));
    });
  }, [getPupils]);

  const clientToSvg = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) {
      return null;
    }

    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) {
      return null;
    }

    const point = svgRef.current.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(ctm.inverse());
  }, []);

  const moveEyes = useCallback(
    (clientX: number, clientY: number) => {
      if (passwordMode) {
        return;
      }

      const point = clientToSvg(clientX, clientY);
      if (!point) {
        return;
      }

      getPupils().forEach(pupil => {
        const eyeX = Number.parseFloat(pupil.dataset.eyeX || '0');
        const eyeY = Number.parseFloat(pupil.dataset.eyeY || '0');
        const dx = point.x - eyeX;
        const dy = point.y - eyeY;
        const angle = Math.atan2(dy, dx);
        const radius = 3.2;
        pupil.setAttribute('cx', String(eyeX + Math.cos(angle) * radius));
        pupil.setAttribute('cy', String(eyeY + Math.sin(angle) * radius));
      });
    },
    [clientToSvg, getPupils, passwordMode]
  );

  useEffect(() => {
    if (passwordMode) {
      setPasswordLook();
      return;
    }

    setNormalLook();
  }, [passwordMode, setNormalLook, setPasswordLook]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      moveEyes(event.clientX, event.clientY);
    };

    document.addEventListener('mousemove', handleMouseMove);
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, [moveEyes]);

  useEffect(() => {
    setNormalLook();
  }, [setNormalLook]);

  return (
    <div className="auth-page">
      <div className="auth-page-bg">
        <div className="auth-page-bg-grid" />
        <div className="auth-blob auth-blob-1" />
        <div className="auth-blob auth-blob-2" />
        <div className="auth-blob auth-blob-3" />
        <div className="auth-blob auth-blob-4" />
        <div className="auth-blob auth-blob-5" />
      </div>

      <div ref={shellRef} className={`auth-shell${passwordMode ? ' password-mode' : ''}`}>
        <div className="auth-brand">
          <div className="auth-brand-mark" />
          <div className="auth-brand-text">VXStudio</div>
        </div>
        {topCenterText && <div className="auth-top-center">{topCenterText}</div>}

        <div className="auth-content">
          <section className="auth-left">
            <div className="auth-illustration-wrap">
              <svg
                id="charactersSvg"
                ref={svgRef}
                viewBox="0 0 460 320"
                className="auth-illustration"
                aria-hidden="true"
              >
                <ellipse className="ground-shadow" cx="225" cy="266" rx="122" ry="16" />

                <g id="char-purple" className="character-svg">
                  <rect x="152" y="58" width="104" height="176" rx="8" fill="#6b46ff" />
                  <circle className="eye-open" cx="210" cy="84" r="8" />
                  <circle className="eye-open" cx="236" cy="84" r="8" />
                  <line className="eye-closed" x1="203" y1="84" x2="217" y2="84" />
                  <line className="eye-closed" x1="229" y1="84" x2="243" y2="84" />
                  <circle className="pupil" data-eye-x="210" data-eye-y="84" cx="212.5" cy="84" r="2.8" />
                  <circle className="pupil" data-eye-x="236" data-eye-y="84" cx="238.5" cy="84" r="2.8" />
                </g>

                <g id="char-dark" className="character-svg">
                  <rect x="232" y="102" width="64" height="132" rx="4" fill="#23262d" />
                  <circle className="eye-open" cx="255" cy="122" r="8" />
                  <circle className="eye-open" cx="279" cy="122" r="8" />
                  <line className="eye-closed" x1="248" y1="122" x2="262" y2="122" />
                  <line className="eye-closed" x1="272" y1="122" x2="286" y2="122" />
                  <circle className="pupil" data-eye-x="255" data-eye-y="122" cx="257.5" cy="122" r="2.8" />
                  <circle className="pupil" data-eye-x="279" data-eye-y="122" cx="281.5" cy="122" r="2.8" />
                </g>

                <g id="char-orange" className="character-svg">
                  <path d="M104 234 L104 182 Q104 128 164 128 Q224 128 224 182 L224 234 Z" fill="#f89a68" />
                  <circle className="eye-open" cx="166" cy="166" r="8" />
                  <circle className="eye-open" cx="190" cy="166" r="8" />
                  <line className="eye-closed" x1="159" y1="166" x2="173" y2="166" />
                  <line className="eye-closed" x1="183" y1="166" x2="197" y2="166" />
                  <circle className="pupil" data-eye-x="166" data-eye-y="166" cx="168.5" cy="166" r="2.8" />
                  <circle className="pupil" data-eye-x="190" data-eye-y="166" cx="192.5" cy="166" r="2.8" />
                </g>

                <g id="char-yellow" className="character-svg">
                  <path d="M256 234 L256 186 Q256 142 302 142 Q348 142 348 186 L348 234 Z" fill="#e6d54e" />
                  <circle className="eye-open" cx="301" cy="162" r="8" />
                  <circle className="eye-open" cx="321" cy="162" r="8" />
                  <line className="eye-closed" x1="294" y1="162" x2="308" y2="162" />
                  <line className="eye-closed" x1="314" y1="162" x2="328" y2="162" />
                  <circle className="pupil" data-eye-x="301" data-eye-y="162" cx="303.5" cy="162" r="2.8" />
                  <circle className="pupil" data-eye-x="321" data-eye-y="162" cx="323.5" cy="162" r="2.8" />
                  <line className="mouth" x1="287" y1="184" x2="325" y2="184" />
                </g>
              </svg>
            </div>
          </section>

          <section className="auth-right">
            <div className="auth-card">
              <h2 className="auth-title">{title}</h2>
              {subtitle && <p className="auth-subtitle">{subtitle}</p>}

              <form onSubmit={onSubmit}>
                <div className="auth-group">
                  <div className="auth-label">{usernameLabel}</div>
                  <input
                    className="auth-input"
                    value={username}
                    onChange={event => onUsernameChange(event.target.value)}
                    onFocus={() => setPasswordMode(false)}
                    autoComplete="username"
                    placeholder={usernameLabel}
                  />
                </div>

                <div className="auth-group">
                  <div className="auth-label">{passwordLabel}</div>
                  <input
                    className="auth-input"
                    type="password"
                    value={password}
                    onChange={event => onPasswordChange(event.target.value)}
                    onFocus={() => setPasswordMode(true)}
                    onInput={() => setPasswordMode(true)}
                    onBlur={() => setPasswordMode(false)}
                    autoComplete="current-password"
                    placeholder={passwordLabel}
                  />
                </div>

                <div className="auth-row">
                  <label className="auth-remember">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={event => onRememberChange(event.target.checked)}
                    />
                    {rememberLabel}
                  </label>
                </div>

                {error && <div className="auth-error">{error}</div>}

                <button className="auth-btn" type="submit" disabled={submitting}>
                  {submitLabel}
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
