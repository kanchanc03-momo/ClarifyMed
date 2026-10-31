import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, ChevronRight, CircleHelp,
  Eye, FileImage, FileText, HeartPulse, History, Home, LockKeyhole, LogOut, Menu,
  MessageCircleQuestion, Plus, Printer, ShieldCheck, Sparkles, Trash2, Upload, UserRound, X
} from 'lucide-react';
import './styles.css';
import './live.css';
import './auth.css';
import {
  analyzeReport, extractReportText, deleteReport, getCurrentUser, getReport, getReports,
  login, logout, register, saveReport, validateReport, validateXray, validateRetinopathy
} from './api';
import { mapAnatomy } from './anatomy';
import { xrayExplanation, reportDisagreesWithXray, DISAGREEMENT_EXPLANATION } from './xray-result';

class AppErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main style={{ maxWidth: '680px', margin: '80px auto', padding: '24px', color: '#213735', fontFamily: 'sans-serif' }}>
        <h1>ClarifyMed could not display this page</h1>
        <p>Please refresh and try again. Your uploaded file was not saved.</p>
        <pre style={{ whiteSpace: 'pre-wrap', color: '#8b3a2f', background: '#fff4e5', padding: '12px', borderRadius: '8px' }}>{String(this.state.error?.message || this.state.error || 'Unknown display error')}</pre>
        <button className="primary" onClick={() => window.location.reload()}>Refresh ClarifyMed</button>
      </main>
    );
  }
}

function Logo() {
  return <div className="logo"><span className="logo-mark"><HeartPulse size={20}/></span><span>Clarify<span>Med</span></span></div>;
}

function HowItWorksModal({ onClose }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="how-it-works-title" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-card">
        <div className="modal-head">
          <h2 id="how-it-works-title"><Sparkles size={22}/> How ClarifyMed Works</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close modal"><X size={20}/></button>
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '14px', margin: '0 0 16px', lineHeight: 1.6 }}>
          ClarifyMed is an explanation aid designed to help you understand medical language before talking with your doctor.
        </p>
        <div className="modal-step-list">
          <div className="modal-step-item">
            <div className="modal-step-num">1</div>
            <div className="modal-step-content">
              <strong>Private & In-Memory Analysis</strong>
              <p>Uploaded documents (PDFs, scans, or photos) are processed securely in memory and never permanently stored without your consent.</p>
            </div>
          </div>
          <div className="modal-step-item">
            <div className="modal-step-num">2</div>
            <div className="modal-step-content">
              <strong>Medical NLP & Entity Extraction</strong>
              <p>Our extraction pipeline identifies clinical findings, anatomical locations, and measurements written in your report.</p>
            </div>
          </div>
          <div className="modal-step-item">
            <div className="modal-step-num">3</div>
            <div className="modal-step-content">
              <strong>Plain-Language Translation & Severity Guidance</strong>
              <p>Medical terminology is translated into calm, clear English, and follow-up guidance is categorized as Routine, Review Suggested, or Prompt Attention.</p>
            </div>
          </div>
          <div className="modal-step-item">
            <div className="modal-step-num">4</div>
            <div className="modal-step-content">
              <strong>Actionable Clinician Questions</strong>
              <p>Receive tailored questions you can take to your appointment to make the most of your conversation with your doctor.</p>
            </div>
          </div>
        </div>
        <div style={{ background: '#f5faf7', border: '1px solid var(--line)', borderRadius: '10px', padding: '12px 16px', fontSize: '12px', color: 'var(--green)', display: 'flex', gap: '10px', alignItems: 'center', marginTop: '16px' }}>
          <ShieldCheck size={20} style={{ flexShrink: 0 }}/>
          <span><strong>Safety First:</strong> ClarifyMed does not diagnose, prescribe, or provide emergency triage. Always consult a qualified physician.</span>
        </div>
        <div className="modal-actions">
          <button className="primary" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ reportName, onConfirm, onCancel, deleting }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal-card" style={{ maxWidth: '440px' }}>
        <div className="modal-head">
          <h2 style={{ color: '#c0392b' }}><Trash2 size={22}/> Delete Report</h2>
          <button className="modal-close" onClick={onCancel} aria-label="Close"><X size={20}/></button>
        </div>
        <p style={{ fontSize: '14px', color: 'var(--muted)', lineHeight: 1.5, margin: '0 0 20px' }}>
          Are you sure you want to delete <strong>{reportName}</strong>? This action cannot be undone.
        </p>
        <div className="modal-actions">
          <button className="ghost-btn" onClick={onCancel} disabled={deleting}>Cancel</button>
          <button className="danger-btn" onClick={onConfirm} disabled={deleting}>
            {deleting ? 'Deleting…' : <><Trash2 size={16}/> Delete</>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Shell({ children, page, setPage, onOpenHowItWorks, user, onLogout }) {
  const [menu, setMenu] = useState(false);
  return (
    <div className="app-shell">
      <header>
        <Logo />
        <nav className={menu ? 'open' : ''}>
          <button className={page === 'home' ? 'active' : ''} onClick={() => { setPage('home'); setMenu(false); }}><Home size={17}/> Home</button>
          <button className={page === 'history' ? 'active' : ''} onClick={() => { setPage('history'); setMenu(false); }}><History size={17}/> My reports</button>
          <button onClick={() => { onOpenHowItWorks(); setMenu(false); }}><CircleHelp size={17}/> How it works</button>
        </nav>
        <div className="header-end">
          <div className="privacy"><LockKeyhole size={14}/> Files not retained</div>
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button className="avatar" onClick={() => setPage('history')} title={`Signed in as ${user.email}`} aria-label="My Account">
                <UserRound size={18}/>
              </button>
              <button className="avatar" onClick={onLogout} title="Sign out" aria-label="Sign out" style={{ color: 'var(--muted)' }}>
                <LogOut size={16}/>
              </button>
            </div>
          ) : (
            <button className="avatar" onClick={() => setPage('auth')} title="Sign in" aria-label="Account">
              <UserRound size={18}/>
            </button>
          )}
          <button className="menu" onClick={() => setMenu(!menu)} aria-label="Toggle menu"><Menu/></button>
        </div>
      </header>
      <main>{children}</main>
      <footer>
        <div><Logo/><p>Clarity for the moments that matter.</p></div>
        <p>ClarifyMed explains report terminology. It does not diagnose or replace medical advice.</p>
        <span>© 2026 ClarifyMed</span>
      </footer>
    </div>
  );
}

function AuthPage({ onAuthenticated, goHome }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = mode === 'login' ? await login(email, password) : await register(email, password);
      onAuthenticated(result.user);
    } catch (issue) {
      setError(issue.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="auth-page">
      <button className="back" onClick={goHome}><ArrowLeft/> Back home</button>
      <div className="auth-card">
        <span className="eyebrow"><ShieldCheck/> Private report history</span>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p>{mode === 'login' ? 'Sign in to view reports saved to your account.' : 'Create an account so saved explanations are visible only to you.'}</p>
        <form onSubmit={submit}>
          <label>Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required/></label>
          <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength="12" maxLength="128" value={password} onChange={e => setPassword(e.target.value)} required/></label>
          {mode === 'register' && <small>Use at least 12 characters.</small>}
          {error && <div className="upload-error" role="alert">{error}</div>}
          <button className="primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        </form>
        <button className="auth-switch" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
        </button>
      </div>
    </section>
  );
}

function HomePage({ onResult, onPairedResult }) {
  const [file, setFile] = useState(null);
  const [inputType, setInputType] = useState('report');
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [extraction, setExtraction] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [wristConfirmed, setWristConfirmed] = useState(false);
  const [retinaConfirmed, setRetinaConfirmed] = useState(false);
  const [pairedFile, setPairedFile] = useState(null);
  const [pairedWristConfirmed, setPairedWristConfirmed] = useState(false);
  const [pairedRetinaConfirmed, setPairedRetinaConfirmed] = useState(false);
  const busy = loading || extracting;

  const choose = (f) => {
    if (busy) return;
    setExtraction(null);
    let issue = null;
    if (inputType === 'xray') issue = validateXray(f);
    else if (inputType === 'retinopathy') issue = validateRetinopathy(f);
    else issue = validateReport(f);
    setError(issue || '');
    setFile(issue ? null : f);
  };

  const changeType = value => {
    if (busy) return;
    setExtraction(null);
    setInputType(value);
    setWristConfirmed(false);
    setRetinaConfirmed(false);
    setPairedFile(null);
    setPairedWristConfirmed(false);
    setPairedRetinaConfirmed(false);
    setFile(null);
    setError('');
  };

  const analyze = async () => {
    setLoading(true);
    setError('');
    try {
      const confirmed = inputType === 'retinopathy' ? retinaConfirmed : wristConfirmed;
      onResult(await analyzeReport(file, inputType, confirmed));
    } catch (issue) {
      setError(issue.message);
    } finally {
      setLoading(false);
    }
  };

  const analyzePair = async () => {
    if (!file || !pairedFile) return;
    setLoading(true);
    setError('');
    try {
      const isReportFirst = inputType === 'report';
      const reportFile = isReportFirst ? file : pairedFile;
      const imageFile = isReportFirst ? pairedFile : file;
      const imageType = isReportFirst ? (pairedRetinaConfirmed ? 'retinopathy' : 'xray') : inputType;
      const confirmed = isReportFirst ? (imageType === 'retinopathy' ? pairedRetinaConfirmed : pairedWristConfirmed) : (inputType === 'retinopathy' ? retinaConfirmed : wristConfirmed);

      const [reportResult, imageResult] = await Promise.all([
        analyzeReport(reportFile, 'report'),
        analyzeReport(imageFile, imageType, confirmed),
      ]);
      onPairedResult({ report: reportResult, xray: imageResult });
    } catch (issue) {
      setError(issue.message);
    } finally {
      setLoading(false);
    }
  };

  const extract = async () => {
    setExtracting(true);
    setError('');
    setExtraction(null);
    try {
      setExtraction(await extractReportText(file));
    } catch (issue) {
      setError(issue.message);
    } finally {
      setExtracting(false);
    }
  };

  return (
    <>
      <section className="hero">
        <div className="eyebrow"><Sparkles size={15}/> Medical language, made human</div>
        <h1>Your medical report.<br/><em>Clearly explained.</em></h1>
        <p>Upload a medical report or imaging scan and get a calm, plain-language explanation—so you can feel informed before speaking with your doctor.</p>
        <div className="trust-row">
          <span><ShieldCheck/> Your files stay private</span>
          <span><Check/> Clear, careful language</span>
          <span><MessageCircleQuestion/> Questions for your doctor</span>
        </div>
      </section>
      <section className="upload-wrap">
        <div className="upload-card">
          <div className="step-label"><span>1</span> Choose an analysis mode</div>
          <div className="input-type" role="group" aria-label="Choose analysis type">
            <button className={inputType === 'report' ? 'selected' : ''} onClick={() => changeType('report')}><FileText/> Explain a report</button>
            <button className={inputType === 'retinopathy' ? 'selected' : ''} onClick={() => changeType('retinopathy')}><Eye/> Diabetic retinopathy screening</button>
            <button className={inputType === 'xray' ? 'selected' : ''} onClick={() => changeType('xray')}><FileImage/> Pediatric wrist X-ray</button>
          </div>
          {!file ? (
            <label className={`dropzone ${drag ? 'drag' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); choose(e.dataTransfer.files[0]); }}>
              <input type="file" accept={inputType === 'report' ? '.pdf,.png,.jpg,.jpeg' : '.png,.jpg,.jpeg'} onChange={e => choose(e.target.files[0])}/>
              <div className="upload-icon"><Upload/></div>
              <h3>
                {inputType === 'xray' ? 'Drop a pediatric wrist X-ray here' : inputType === 'retinopathy' ? 'Drop a retinal fundus photograph here' : 'Drop a medical report here'}
              </h3>
              <p>or click to browse your files</p>
              <div className="formats">
                {inputType === 'xray' ? (
                  <><span><FileImage/> JPG or PNG only</span><span><ShieldCheck/> Pediatric wrist only</span></>
                ) : inputType === 'retinopathy' ? (
                  <><span><Eye/> JPG or PNG fundus scan</span><span><ShieldCheck/> Color retina image</span></>
                ) : (
                  <><span><FileText/> PDF report</span><span><FileImage/> Scan or photo</span></>
                )}
              </div>
              <small>
                {inputType === 'report' ? 'PDF, JPG or PNG · Maximum 20 MB · PDFs up to 50 pages' : 'JPG or PNG · Maximum 20 MB'}
              </small>
            </label>
          ) : (
            <div className="selected-file">
              <div className="file-icon">{inputType === 'retinopathy' ? <Eye/> : <FileText/>}</div>
              <div>
                <strong>{file.name}</strong>
                <span>{(file.size / 1024 / 1024).toFixed(2)} MB · {inputType === 'retinopathy' ? 'Ready for retinal screening' : inputType === 'xray' ? 'Ready for model analysis' : 'Ready for report explanation'}</span>
              </div>
              <button disabled={busy} onClick={() => { setFile(null); setExtraction(null); setError(''); }} aria-label="Remove"><X/></button>
            </div>
          )}
          {inputType === 'xray' && <label className="xray-scope-confirm"><input type="checkbox" checked={wristConfirmed} onChange={e => setWristConfirmed(e.target.checked)}/> I confirm this is a pediatric wrist X-ray. Other X-ray types and adult images are unsupported.</label>}
          {inputType === 'retinopathy' && <label className="xray-scope-confirm"><input type="checkbox" checked={retinaConfirmed} onChange={e => setRetinaConfirmed(e.target.checked)}/> I confirm this is a color retinal fundus image.</label>}
          {error && <div className="upload-error" role="alert">{error}</div>}
          {inputType === 'report' && <button className="primary extract-button" disabled={!file || busy} onClick={extract}>
            {extracting ? <><span className="spinner"/> Extracting report text...</> : <><FileText size={18}/> Extract text</>}
          </button>}
          <div role="status" aria-live="polite" className="extraction-status">{extracting ? 'Reading your report. Large scanned reports may take a few minutes.' : extraction ? `Text extracted from ${extraction.pageCount || 1} page${(extraction.pageCount || 1) === 1 ? '' : 's'}.` : ''}</div>
          {extraction && <section className="extracted-text-panel" aria-labelledby="extracted-text-title">
            <h3 id="extracted-text-title">Extracted report text</h3>
            <p>{extraction.extractionMethod === 'pdf_text' ? 'Read directly from your PDF.' : 'Transcribed from your report image.'} This preview is not saved to report history.</p>
            {(Array.isArray(extraction.warnings) ? extraction.warnings : []).map((warning, index) => <p className="extraction-warning" key={index}>{warning}</p>)}
            <textarea aria-label="Extracted report text" readOnly value={typeof extraction.extractedText === 'string' ? extraction.extractedText : ''} rows={12}/>
          </section>}
          <div className="analysis-actions">
            <button className="primary" disabled={!file || busy || (inputType === 'xray' && !wristConfirmed) || (inputType === 'retinopathy' && !retinaConfirmed)} onClick={analyze}>
              {loading ? (
                <><span className="spinner"/> {inputType === 'xray' ? 'Checking the wrist X-ray…' : inputType === 'retinopathy' ? 'Screening retinal fundus photo…' : 'Reading your report…'}</>
              ) : (
                <>{inputType === 'xray' ? 'Analyze wrist X-ray' : inputType === 'retinopathy' ? 'Screen retinal image' : 'Explain my report'} <ArrowRight size={18}/></>
              )}
            </button>
            {inputType === 'report' ? (
              <label className="secondary paired-file-button"><FileImage size={18}/> Add scan / X-ray image
                <input type="file" disabled={busy} accept=".png,.jpg,.jpeg" onChange={event => {
                  const nextFile = event.target.files?.[0] || null;
                  const issue = validateXray(nextFile);
                  setError(issue || ''); setPairedFile(issue ? null : nextFile); setPairedWristConfirmed(false); setPairedRetinaConfirmed(false);
                }}/>
              </label>
            ) : (
              <label className="secondary paired-file-button"><FileText size={18}/> Add clinical report
                <input type="file" disabled={busy} accept=".pdf,.png,.jpg,.jpeg" onChange={event => {
                  const nextFile = event.target.files?.[0] || null;
                  const issue = validateReport(nextFile);
                  setError(issue || ''); setPairedFile(issue ? null : nextFile);
                }}/>
              </label>
            )}
          </div>
          {pairedFile && <div className="paired-selection"><span>{pairedFile.name} · {(pairedFile.size / 1024 / 1024).toFixed(2)} MB</span><button type="button" disabled={busy} onClick={() => { setPairedFile(null); setPairedWristConfirmed(false); setPairedRetinaConfirmed(false); }}>Remove</button></div>}
          {pairedFile && inputType === 'report' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
              <label className="xray-scope-confirm">
                <input type="checkbox" checked={pairedWristConfirmed} onChange={event => { setPairedWristConfirmed(event.target.checked); if (event.target.checked) setPairedRetinaConfirmed(false); }}/> I confirm the additional image is a pediatric wrist X-ray.
              </label>
              <label className="xray-scope-confirm">
                <input type="checkbox" checked={pairedRetinaConfirmed} onChange={event => { setPairedRetinaConfirmed(event.target.checked); if (event.target.checked) setPairedWristConfirmed(false); }}/> I confirm the additional image is a retinal fundus scan.
              </label>
            </div>
          )}
          {pairedFile && (
            <button
              className="secondary"
              disabled={
                !file || busy || (
                  inputType === 'report'
                    ? (!pairedWristConfirmed && !pairedRetinaConfirmed)
                    : (inputType === 'retinopathy' ? !retinaConfirmed : !wristConfirmed)
                )
              }
              onClick={analyzePair}
            >
              Analyze report + image together
            </button>
          )}
          <p className="consent"><ShieldCheck size={15}/> {inputType === 'xray' ? 'Pediatric wrist X-rays only. This research/demo result is not a diagnosis.' : inputType === 'retinopathy' ? 'Diabetic retinopathy screening aid. Consult an eye care professional for medical diagnosis.' : 'Your original upload is processed for this request and is not deliberately saved by ClarifyMed.'}</p>
        </div>
        <aside className="expect">
          <span className="step-label"><span>2</span> Get a clear explanation</span>
          <h2>What you’ll receive</h2>
          {[
            ['01', 'A simple summary', 'The key finding, without clinical jargon.'],
            ['02', 'Helpful visual context', 'See where the finding is and what it refers to.'],
            ['03', 'A calm next step', 'Understand the follow-up suggested in your report.'],
            ['04', 'Questions to take along', 'Feel more prepared for your doctor visit.']
          ].map(x => (
            <div className="expect-row" key={x[0]}>
              <b>{x[0]}</b>
              <div><strong>{x[1]}</strong><p>{x[2]}</p></div>
            </div>
          ))}
        </aside>
      </section>
      <section className="safety-note">
        <ShieldCheck/>
        <div>
          <strong>Designed with safety at the center</strong>
          <p>ClarifyMed explains the words already in your report. It won’t diagnose you, recommend treatment, or replace a conversation with your healthcare professional.</p>
        </div>
      </section>
    </>
  );
}

function Severity({ report }) {
  const selected = { routine: 0, monitor: 1, prompt: 2 }[report.followUpLevel || 'monitor'];
  return (
    <div className="severity">
      <div className="severity-head">
        <span>Follow-up guidance</span>
        <strong>{report.followUpLabel || report.status}</strong>
      </div>
      <div className="gauge">
        {[0, 1, 2].map(i => <i className={i === selected ? 'selected' : ''} key={i}/>)}
      </div>
      <div className="gauge-labels">
        <span>Routine</span>
        <span>Review suggested</span>
        <span>Prompt attention</span>
      </div>
      <p>{report.followUpExplanation || 'Discuss the report wording and appropriate timing with your doctor.'}</p>
    </div>
  );
}

function BodyVisual() {
  return (
    <div className="body-visual">
      <svg viewBox="0 0 220 260" aria-label="Diagram highlighting the lower right lung">
        <path className="silhouette" d="M110 14c-18 0-29 13-29 30 0 12 7 23 14 27-2 8-10 14-21 19-24 11-31 30-29 58l7 91h116l7-91c2-28-5-47-29-58-11-5-19-11-21-19 7-4 14-15 14-27 0-17-11-30-29-30z"/>
        <path className="organ" d="M104 91c-24-14-43 5-41 41 1 27 14 50 41 54V91zm12 0c24-14 43 5 41 41-1 27-14 50-41 54V91z"/>
        <path className="trachea" d="M110 67v41m0-17l-19 20m19-20l19 20"/>
        <circle className="finding" cx="137" cy="160" r="10"/>
        <circle className="finding-pulse" cx="137" cy="160" r="18"/>
      </svg>
      <div className="visual-label">
        <span/> Finding noted here<br/><small>Lower right lung</small>
      </div>
    </div>
  );
}

function LocationVisual({ location }) {
  const mapped = mapAnatomy(location);
  return (
    <div className="body-visual location-summary">
      {mapped ? (
        <svg viewBox="0 0 220 260" aria-label={`Reference body diagram marking ${mapped.label}`}>
          <path className="silhouette" d="M110 14c-18 0-29 13-29 30 0 12 7 23 14 27-2 8-10 14-21 19-24 11-31 30-29 58l7 91h116l7-91c2-28-5-47-29-58-11-5-19-11-21-19 7-4 14-15 14-27 0-17-11-30-29-30z"/>
          <circle className="finding-pulse" cx={mapped.x} cy={mapped.y} r="18"/>
          <circle className="finding" cx={mapped.x} cy={mapped.y} r="9"/>
        </svg>
      ) : (
        <FileText size={44}/>
      )}
      <span className="section-kicker">Location described in report</span>
      <strong>{location || 'Not specified'}</strong>
      <small>{mapped ? `Approximate reference-body location: ${mapped.label}. This marker is derived from the report text, not from image analysis.` : 'Exact image localization is not available from report text alone. Use the location wording above and review the original report with your clinician.'}</small>
    </div>
  );
}

function ResultVisual({ report }) {
  if (report.annotatedImageDataUrl) {
    const isRetina = report.documentType === 'retinopathy';
    if (isRetina) {
      const isHealthy = report.predictedGrade === 0 || report.followUpLevel === 'routine';
      return (
        <div className="body-visual heatmap" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
          {/* 1. Original Image */}
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: '6px' }}>
              📷 1. Original Retinal Photo
            </span>
            <img
              src={report.originalImageDataUrl || report.annotatedImageDataUrl}
              alt="Original Retinal Fundus"
              style={{ width: 'min(100%, 260px)', borderRadius: '10px', border: '1px solid #e2e8f0' }}
            />
          </div>

          {/* 2. Heatmap Shown Separately Below */}
          <div style={{
            textAlign: 'center',
            background: isHealthy ? '#f0fdf4' : '#fffbeb',
            border: isHealthy ? '2px solid #bbf7d0' : '2px solid #fed7aa',
            borderRadius: '12px',
            padding: '12px',
          }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: isHealthy ? '#15803d' : '#c2410c', display: 'block', marginBottom: '6px' }}>
              {isHealthy ? '🔍 2. AI Attention Map (Normal Landmarks)' : '🔥 2. AI Attention Heatmap (Grad-CAM)'}
            </span>
            <img
              src={report.annotatedImageDataUrl}
              alt="Grad-CAM Heatmap Overlay"
              style={{ width: 'min(100%, 260px)', borderRadius: '10px' }}
            />
            <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '0.72rem', fontWeight: 600, color: '#334155' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '9px', height: '9px', background: '#2563eb', borderRadius: '2px' }}></span> Low
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '9px', height: '9px', background: '#eab308', borderRadius: '2px' }}></span> Moderate
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                <span style={{ width: '9px', height: '9px', background: '#dc2626', borderRadius: '2px' }}></span> High Focus
              </span>
            </div>
            <small style={{ display: 'block', marginTop: '6px', color: isHealthy ? '#166534' : '#9a3412', fontSize: '0.75rem', lineHeight: '1.35' }}>
              {isHealthy
                ? 'Healthy verification: The AI focused on key reference landmarks (the bright optic disc and clean vessel roots) to confirm the retina is healthy and free of leaks.'
                : 'Glowing red and yellow areas highlight where the AI model detected microvascular leaks or vessel stress.'}
            </small>
          </div>
        </div>
      );
    }
    return (
      <div className="body-visual heatmap">
        <img
          src={report.annotatedImageDataUrl}
          alt={
            report.detections?.length
              ? 'Pediatric wrist X-ray with model-predicted regions outlined'
              : 'Pediatric wrist X-ray preview with no model-predicted region outlined'
          }
        />
        <small>
          {report.detections?.length
            ? 'Highlighted boxes are model predictions, not confirmed fracture locations.'
            : 'No region was highlighted above the reviewed threshold.'}
        </small>
      </div>
    );
  }
  return report.id ? <LocationVisual location={report.location}/> : <BodyVisual/>;
}

function XrayDetections({ report }) {
  if (report.documentType !== 'xray') return null;
  const detections = Array.isArray(report.detections) ? report.detections : [];
  return <section className="card xray-detections">
    <span className="section-kicker">Model-predicted regions</span>
    <p>Number of predicted regions: {detections.length}</p>
    {detections.length ? detections.map((detection, index) => {
      const box = detection.boundingBox || {};
      const coords = [box.xMin, box.yMin, box.xMax, box.yMax];
      return <div className="details" key={`${index}-${box.xMin}-${box.yMin}`}>
        <div><small>Region {index + 1}</small><strong>Possible fracture-like region</strong></div>
        <div><small>Model confidence</small><strong>{typeof detection.confidence === 'number' ? `${Math.round(detection.confidence * 100)}%` : 'Not available'}</strong></div>
        <div><small>Preview pixel box</small><strong>{coords.every(Number.isFinite) ? `${box.xMin}, ${box.yMin} to ${box.xMax}, ${box.yMax}` : 'See annotated preview'}</strong></div>
      </div>;
    }) : null}
    <p className="source-note">Boxes mark model predictions in the uploaded image; they do not confirm a fracture or precise anatomy.</p>
  </section>;
}

function RetinopathyHeatmapSection({ report }) {
  if (report.documentType !== 'retinopathy' || !report.annotatedImageDataUrl) return null;
  const isHealthy = report.predictedGrade === 0 || report.followUpLevel === 'routine';
  return (
    <section className="card" style={{ marginTop: '16px' }}>
      <span className="section-kicker">Visual AI Explanation</span>
      <h3>{isHealthy ? 'AI Inspection of Healthy Landmarks (Grad-CAM)' : 'AI Attention Heatmap (Grad-CAM)'}</h3>
      <p>
        {isHealthy
          ? 'In a healthy eye with no damage, the neural network uses Grad-CAM to highlight the natural anatomical landmarks (such as the bright optic disc and main blood vessel trunk) that it examined to verify normal retinal structure:'
          : 'The neural network generates a gradient-weighted class activation map (Grad-CAM) showing which areas of the retina influenced its assessment:'}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginTop: '14px' }}>
        <div style={{ textAlign: 'center', background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <strong style={{ display: 'block', fontSize: '0.85rem', marginBottom: '8px', color: '#1e293b' }}>
            📷 1. Original Retinal Photo
          </strong>
          <img
            src={report.originalImageDataUrl || report.annotatedImageDataUrl}
            alt="Original Retinal Photo"
            style={{ width: '100%', maxHeight: '240px', objectFit: 'contain', borderRadius: '8px' }}
          />
          <small style={{ display: 'block', marginTop: '6px', color: '#64748b' }}>Original color fundus photography</small>
        </div>
        <div style={{
          textAlign: 'center',
          background: isHealthy ? '#f0fdf4' : '#fffbeb',
          padding: '12px',
          borderRadius: '12px',
          border: isHealthy ? '2px solid #bbf7d0' : '2px solid #fed7aa',
        }}>
          <strong style={{ display: 'block', fontSize: '0.85rem', marginBottom: '8px', color: isHealthy ? '#15803d' : '#c2410c' }}>
            {isHealthy ? '🔍 2. AI Normal Reference Map' : '🔥 2. AI Attention Heatmap'}
          </strong>
          <img
            src={report.annotatedImageDataUrl}
            alt="AI Attention Heatmap"
            style={{ width: '100%', maxHeight: '240px', objectFit: 'contain', borderRadius: '8px' }}
          />
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '8px', fontSize: '0.72rem', fontWeight: 600 }}>
            <span style={{ color: '#2563eb' }}>🔵 Low</span>
            <span style={{ color: '#ca8a04' }}>🟡 Moderate</span>
            <span style={{ color: '#dc2626' }}>🔴 High Focus</span>
          </div>
          <small style={{ display: 'block', marginTop: '6px', color: isHealthy ? '#166534' : '#9a3412' }}>
            {isHealthy
              ? 'Highlighted area marks the optic disc and healthy vessel origins that the AI verified to confirm no diabetic lesions.'
              : 'Glowing zones highlight microvascular changes and leaking spots.'}
          </small>
        </div>
      </div>
    </section>
  );
}

function ResultPage({ goHome, report, onDeleteReport }) {
  const questions = Array.isArray(report.questions) && report.questions.length > 0
    ? report.questions
    : ['What does this finding mean in the context of my health history?', 'Does the report recommend follow-up, and when?', 'Are there symptoms or changes that should make me contact you sooner?'];
  const [saveState, setSaveState] = useState(report.createdAt ? 'saved' : 'idle');
  const [saveError, setSaveError] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const save = async () => {
    setSaveState('saving');
    setSaveError('');
    try {
      await saveReport(report);
      setSaveState('saved');
    } catch (issue) {
      if (issue.message.includes('already saved')) setSaveState('saved');
      else {
        setSaveState('idle');
        setSaveError(issue.message);
      }
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDeleteReport(report.id);
    } catch (issue) {
      setSaveError(issue.message);
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  return (
    <div className="result-page">
      {showDeleteModal && (
        <DeleteConfirmModal
          reportName={report.name}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
          deleting={deleting}
        />
      )}
      <button className="back" onClick={goHome}><ArrowLeft/> Back to upload</button>
      <div className="result-title">
        <div>
          <span className="complete"><Check/> {report.documentType === 'xray' ? 'X-ray model result ready' : 'Report explanation ready'}</span>
          <h1>{report.documentType === 'xray' ? 'Pediatric wrist X-ray result' : 'Here’s what your report says'}</h1>
          <p>{report.name} · {report.date}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="secondary" onClick={() => window.print()} title="Print or save as PDF">
            <Printer size={16}/> Print for doctor
          </button>
          {report.createdAt && (
            <button className="secondary" onClick={() => setShowDeleteModal(true)} title="Delete saved report" style={{ color: '#c0392b' }}>
              <Trash2 size={16}/> Delete
            </button>
          )}
          <button className="secondary" onClick={goHome}><Plus/> Add another report</button>
        </div>
      </div>
      <div className="disclaimer">
        <ShieldCheck/>
        <div>
          <strong>{report.documentType === 'xray' ? 'This research/demo result is not a diagnosis.' : 'This is an explanation, not a diagnosis.'}</strong>
          <span>{report.documentType === 'xray' ? 'External dataset testing and clinician review are still required. A medical professional should review the original X-ray.' : 'Always discuss medical results and next steps with your healthcare professional.'}</span>
        </div>
      </div>
      <section className="summary-card">
        <div className="summary-copy">
          <span className="section-kicker">In plain language</span>
          <h2>{report.title}</h2>
          <p>{report.documentType === 'xray' ? xrayExplanation(report) : report.summary}</p>
        </div>
        <ResultVisual report={report}/>
      </section>
      <div className="result-grid">
        <div>
          <section className="card">
            <span className="section-kicker">{report.documentType === 'xray' ? 'X-ray model details' : 'Key details from the report'}</span>
            <div className="details">
              <div><small>Finding</small><strong>{report.finding || report.title}</strong></div>
              <div><small>Location</small><strong>{report.location}</strong></div>
              <div><small>{report.documentType === 'xray' ? 'Confidence score' : 'Measurement'}</small><strong>{report.documentType === 'xray' && typeof report.fractureScore === 'number' ? `${Math.round(report.fractureScore * 100)}%` : report.measurement}</strong></div>
            </div>
          </section>
          <XrayDetections report={report}/>
          <RetinopathyHeatmapSection report={report}/>
          <section className="card context">
            <span className="section-kicker">{report.documentType === 'xray' ? 'What this X-ray result means' : 'What this usually means'}</span>
            <p>{report.documentType === 'xray' ? 'The model only checks image patterns. A qualified clinician should interpret the original X-ray and any radiology report.' : report.context}</p>
            {report.documentType === 'xray' && <p>A confidence score shows how strongly the research model matched an image pattern. It is not the chance that a fracture is present. The model cannot assess pain, symptoms, or treatment needs.</p>}
            <div className="source-note">
              <CircleHelp/> {report.limitations || 'This is general context. Your doctor can explain what it means for you specifically.'}
            </div>
          </section>
        </div>
        <div>
          {report.documentType !== 'xray' && <Severity report={report}/>}
          <section className="card questions">
            <span className="section-kicker">Questions for your doctor</span>
            <h3>You may want to ask:</h3>
            {questions.map((q, i) => (
              <div className="question" key={q}>
                <span>{i + 1}</span>{q}
              </div>
            ))}
          </section>
        </div>
      </div>
      <div className="next-step">
        <div className="next-icon"><CalendarDays/></div>
        <div>
          <span className="section-kicker">Your next step</span>
          <h2>Talk this through with your doctor</h2>
          <p>{report.documentType === 'xray' ? 'Bring the original X-ray and any written radiology report. A clinician can explain the image alongside symptoms and decide whether follow-up is needed.' : 'Bring this explanation and your original report. Your doctor can review your health history and decide whether any follow-up is needed.'}</p>
          {saveError && <small role="alert" style={{ color: '#c0392b', display: 'block', marginTop: '6px' }}>{saveError}</small>}
        </div>
        <button className="primary" disabled={saveState !== 'idle'} onClick={save}>
          {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved to my reports' : <>Save to my reports <ArrowRight/></>}
        </button>
      </div>
      <p className="bottom-disclaimer">
        ClarifyMed explains report terminology and is not a medical device or diagnostic service. If you feel seriously unwell or believe you may have an emergency, contact local emergency services.
      </p>
    </div>
  );
}

function PairedResultPage({ goHome, pair }) {
  const report = pair.report;
  const xray = pair.xray;
  const different = reportDisagreesWithXray(report, xray);
  return <div className="result-page">
    <button className="back" onClick={goHome}><ArrowLeft/> Back to upload</button>
    <div className="result-title"><div><span className="complete"><Check/> Separate results ready</span><h1>Report and X-ray results</h1></div></div>
    <div className="disclaimer"><ShieldCheck/><div><strong>These outputs are independent and are not a diagnosis.</strong><span>The written report and research model do not confirm one another. A qualified clinician should review both original sources.</span></div></div>
    {different && <div className="upload-error" role="status">{DISAGREEMENT_EXPLANATION}</div>}
    <div className="result-grid paired-results">
      <section className="card"><span className="section-kicker">Radiology report explanation</span><h2>{report.title}</h2><p>{report.summary}</p><p><strong>Finding:</strong> {report.finding || report.title}</p><p><strong>Anatomy:</strong> {report.location}</p><p><strong>Measurement:</strong> {report.measurement}</p><p>{report.limitations}</p><h3>Questions for your doctor</h3>{(report.questions || []).map(question => <p key={question}>• {question}</p>)}</section>
      <section className="card"><span className="section-kicker">X-ray model result</span><h2>{xray.title}</h2><p>{xrayExplanation(xray)}</p><ResultVisual report={xray}/><h3>What this X-ray result means</h3><p>A confidence score describes the model's image-pattern match, not the chance that a fracture is present.</p><p>{xray.limitations}</p><XrayDetections report={xray}/><h3>Questions for your doctor</h3>{(xray.questions || []).map(question => <p key={question}>• {question}</p>)}</section>
    </div>
    <p className="bottom-disclaimer">The report explanation is based on extracted written text. The X-ray model result is based on the separately uploaded image. Differences require clinician review.</p>
  </div>;
}

function savedReportType(value) {
  if (typeof value !== 'string' || !value.trim()) return 'Medical report';
  return value.replaceAll('_', ' ');
}

function savedReportDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(date);
}

function HistoryPage({ open, openReport, onDeleteReport }) {
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadReports = () => {
    getReports()
      .then(result => {
        const summaries = Array.isArray(result) ? result : [];
        setReports(summaries.filter(item => item && typeof item === 'object'));
      })
      .catch(issue => setError(issue.message));
  };

  useEffect(() => {
    loadReports();
  }, []);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await onDeleteReport(pendingDelete.id);
      setReports(reports.filter(r => r.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (issue) {
      setError(issue.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="history-page">
      {pendingDelete && (
        <DeleteConfirmModal
          reportName={pendingDelete.name}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
          deleting={deleting}
        />
      )}
      <span className="eyebrow"><History/> Your health record</span>
      <h1>My reports</h1>
      <p className="lead">Your previous explanations, kept together and easy to revisit.</p>
      <div className="history-toolbar">
        <span>{reports.length} {reports.length === 1 ? 'report' : 'reports'}</span>
        <button className="primary" onClick={() => open('home')}><Plus/> New report</button>
      </div>
      {error && <div className="upload-error" role="alert">{error}</div>}
      {!error && reports.length === 0 && <p style={{ marginTop: '24px', color: 'var(--muted)' }}>No saved reports yet.</p>}
      {reports.map(item => (
        <div className="report-row" key={item.id} style={{ display: 'flex', alignItems: 'center' }}>
          <div onClick={() => openReport(item.id)} style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, cursor: 'pointer' }}>
            <span className="file-icon"><FileText/></span>
            <div>
              <strong>{item.name || 'Untitled report'}</strong>
              <span>{savedReportType(item.documentType)} · {savedReportDate(item.createdAt)}</span>
            </div>
            <span className="status">{item.followUpLabel || 'Review suggested'}</span>
          </div>
          <div className="report-row-actions">
            <button
              className="delete-icon-btn"
              onClick={e => { e.stopPropagation(); setPendingDelete(item); }}
              title="Delete report"
              aria-label={`Delete ${item.name}`}
            >
              <Trash2 size={18}/>
            </button>
            <button
              style={{ border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: '8px' }}
              onClick={() => openReport(item.id)}
              aria-label="Open report"
            >
              <ChevronRight/>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AuthenticatedApp() {
  const [page, setPage] = useState('home');
  const [report, setReport] = useState(null);
  const [pairedResult, setPairedResult] = useState(null);
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);
  const [navigationError, setNavigationError] = useState('');
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  useEffect(() => {
    getCurrentUser().then(result => setUser(result.user)).catch(() => {}).finally(() => setChecked(true));
    const params = new URLSearchParams(window.location.search);
    const demo = params.get('demo');
    if (demo === 'report') {
      setReport({
        id: 'demo-report-1',
        name: 'MRI_Right_Shoulder_Report.pdf',
        date: '31 Oct 2026',
        documentType: 'text_report',
        title: 'MRI Right Shoulder Examination',
        summary: 'A bone scan of your right shoulder shows a benign-looking area inside the upper arm bone (proximal humerus) near the joint. It measures 4.6 cm. The report notes no signs of aggressive disease, like bone breakdown or soft tissue invasion. All shoulder muscles and tendons look healthy with no tears.',
        finding: 'Benign-appearing intraosseous lesion in proximal humerus',
        location: 'Right shoulder, specifically the upper arm bone (proximal humerus)',
        measurement: '4.6 cm',
        context: 'Intraosseous lesions in the proximal humerus are often incidental, benign findings like enchondromas or bone cysts. No cortical breakthrough or soft tissue involvement is reassuring.',
        followUpLevel: 'monitor',
        followUpLabel: 'Review suggested',
        followUpExplanation: 'Schedule a routine follow-up with your physician or orthopedist to review the imaging and determine if periodic monitoring is recommended.',
        questions: [
          'What type of bone lesion is most consistent with these MRI characteristics?',
          'Do we need periodic follow-up scans to monitor for any changes in size?',
          'Are there any activity restrictions or physical therapy recommendations?'
        ],
        limitations: 'This explanation is based on written text and does not replace evaluation by a qualified orthopedic specialist or radiologist.'
      });
      setPage('result');
    } else if (demo === 'modal') {
      setHowItWorksOpen(true);
    } else if (demo === 'paired') {
      setPairedResult({
        report: {
          id: 'demo-report-paired',
          name: 'Wrist_Radiology_Report.pdf',
          title: 'Pediatric Left Wrist Radiograph Report',
          summary: 'The radiology report describes a distal radial buckle fracture with minimal angulation and intact soft tissue planes.',
          finding: 'Distal radius buckle fracture',
          location: 'Left wrist / distal radius',
          measurement: 'Subtle cortical disruption',
          limitations: 'Report interpretation only.',
          questions: ['Does this buckle fracture require a splint or cast?', 'How long is immobilization recommended?', 'When should follow-up X-rays be taken?']
        },
        xray: {
          id: 'demo-xray-paired',
          name: 'Left_Wrist_AP_View.png',
          documentType: 'xray',
          title: 'Pediatric Wrist X-Ray Analysis',
          fractureScore: 0.88,
          findings: [{ x: 50, y: 120, width: 40, height: 35, confidence: 0.88 }],
          limitations: 'Model detection pattern match. Not a clinical diagnosis.',
          questions: ['Can you confirm if this model-detected region matches the buckle fracture on the film?']
        }
      });
      setPage('paired-result');
    }
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  const showResult = value => {
    setNavigationError('');
    setPairedResult(null);
    setReport(value);
    setPage('result');
  };

  const showPairedResult = value => {
    setNavigationError('');
    setPairedResult(value);
    setPage('paired-result');
  };

  const openReport = async id => {
    setNavigationError('');
    try {
      showResult(await getReport(id));
    } catch (issue) {
      setNavigationError(issue.message);
    }
  };

  const handleDeleteReport = async id => {
    await deleteReport(id);
    setPage('history');
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setPage('home');
    } catch (issue) {
      setNavigationError(issue.message);
    }
  };

  const navigate = value => setPage(value === 'history' && !user ? 'auth' : value);

  if (!checked) return <div className="auth-loading">Loading…</div>;

  return (
    <Shell
      page={page}
      setPage={navigate}
      onOpenHowItWorks={() => setHowItWorksOpen(true)}
      user={user}
      onLogout={handleLogout}
    >
      {howItWorksOpen && <HowItWorksModal onClose={() => setHowItWorksOpen(false)}/>}
      {navigationError && <div className="upload-error" role="alert">{navigationError}</div>}
      {page === 'home' ? (
        <HomePage onResult={showResult} onPairedResult={showPairedResult}/>
      ) : page === 'result' ? (
        <ResultPage key={report.id} report={report} goHome={() => setPage('home')} onDeleteReport={handleDeleteReport}/>
      ) : page === 'paired-result' ? (
        <PairedResultPage pair={pairedResult} goHome={() => setPage('home')}/>
      ) : page === 'auth' || !user ? (
        <AuthPage onAuthenticated={value => { setUser(value); setPage('history'); }} goHome={() => setPage('home')}/>
      ) : (
        <HistoryPage open={setPage} openReport={openReport} onDeleteReport={handleDeleteReport}/>
      )}
    </Shell>
  );
}

const container = document.getElementById('root');
let root = window.__clarifymed_root;
if (!root) {
  root = createRoot(container);
  window.__clarifymed_root = root;
}
root.render(<AppErrorBoundary><AuthenticatedApp/></AppErrorBoundary>);
