import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, ChevronRight, CircleHelp,
  FileImage, FileText, HeartPulse, History, Home, LockKeyhole, LogOut, Menu,
  MessageCircleQuestion, Plus, Printer, ShieldCheck, Sparkles, Trash2, Upload, UserRound, X
} from 'lucide-react';
import './styles.css';
import './live.css';
import './auth.css';
import {
  analyzeReport, extractReportText, deleteReport, getCurrentUser, getReport, getReports,
  login, logout, register, saveReport, validateReport
} from './api';
import { mapAnatomy } from './anatomy';

const demoReport = {
  name: 'Chest X-ray Report.pdf', date: '13 Aug 2026', type: 'Radiology report', status: 'Review suggested',
  title: 'Small opacity in the lower right lung', location: 'Right lower lung', measurement: '1.2 cm',
  summary: 'Your report describes a small, rounded area in the lower part of your right lung. This type of finding is sometimes caused by an old infection or harmless tissue change. The report recommends comparing it with any older scans or discussing whether a follow-up image is needed.',
  context: 'A lung opacity is an area that appears lighter than the surrounding lung on an X-ray. It is a description of what the image looks like—not a diagnosis. Many opacities have non-serious causes, and comparison with an earlier image often provides useful context.',
  questions: ['Do you have an older chest X-ray we can compare this with?', 'Would you recommend another scan, and if so, when?', 'Are there any symptoms I should watch for?']
};

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

function HomePage({ onResult }) {
  const [file, setFile] = useState(null);
  const [inputType, setInputType] = useState('report');
  const [drag, setDrag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [extraction, setExtraction] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const busy = loading || extracting;

  const choose = (f) => {
    if (busy) return;
    setExtraction(null);
    const issue = validateReport(f) || (inputType === 'xray' && f?.type === 'application/pdf' ? 'X-ray analysis requires one JPG or PNG image.' : '');
    setError(issue || '');
    setFile(issue ? null : f);
  };

  const changeType = value => {
    if (busy) return;
    setExtraction(null);
    setInputType(value);
    setFile(null);
    setError('');
  };

  const analyze = async () => {
    setLoading(true);
    setError('');
    try {
      onResult(await analyzeReport(file, inputType));
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
        <p>Upload a report or X-ray and get a calm, plain-language explanation—so you can feel informed before speaking with your doctor.</p>
        <div className="trust-row">
          <span><ShieldCheck/> Your files stay private</span>
          <span><Check/> Clear, careful language</span>
          <span><MessageCircleQuestion/> Questions for your doctor</span>
        </div>
      </section>
      <section className="upload-wrap">
        <div className="upload-card">
          <div className="step-label"><span>1</span> Upload your report</div>
          <div className="input-type" role="group" aria-label="Choose analysis type">
            <button className={inputType === 'report' ? 'selected' : ''} onClick={() => changeType('report')}><FileText/> Medical report</button>
            <button className={inputType === 'xray' ? 'selected' : ''} onClick={() => changeType('xray')}><FileImage/> Musculoskeletal X-ray</button>
          </div>
          {!file ? (
            <label className={`dropzone ${drag ? 'drag' : ''}`} onDragOver={e => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={e => { e.preventDefault(); setDrag(false); choose(e.dataTransfer.files[0]); }}>
              <input type="file" accept={inputType === 'xray' ? '.png,.jpg,.jpeg' : '.pdf,.png,.jpg,.jpeg'} onChange={e => choose(e.target.files[0])}/>
              <div className="upload-icon"><Upload/></div>
              <h3>Drop your report here</h3>
              <p>or click to browse your files</p>
              <div className="formats"><span><FileText/> PDF report</span><span><FileImage/> Scan or photo</span><span><FileImage/> X-ray image</span></div>
              <small>PDF, JPG or PNG · Maximum 20 MB</small>
            </label>
          ) : (
            <div className="selected-file">
              <div className="file-icon"><FileText/></div>
              <div>
                <strong>{file.name}</strong>
                <span>{(file.size / 1024 / 1024).toFixed(2)} MB · Ready to explain</span>
              </div>
              <button disabled={busy} onClick={() => { setFile(null); setExtraction(null); setError(''); }} aria-label="Remove"><X/></button>
            </div>
          )}
          {error && <div className="upload-error" role="alert">{error}</div>}
          {inputType === 'report' && <button className="primary extract-button" disabled={!file || busy} onClick={extract}>
            {extracting ? <><span className="spinner"/> Extracting report text...</> : <><FileText size={18}/> Extract text</>}
          </button>}
          <div role="status" aria-live="polite" className="extraction-status">{extracting ? 'Reading your report. Scanned pages may take longer.' : extraction ? `Text extracted from ${extraction.pageCount} page${extraction.pageCount === 1 ? '' : 's'}.` : ''}</div>
          {extraction && <section className="extracted-text-panel" aria-labelledby="extracted-text-title">
            <h3 id="extracted-text-title">Extracted report text</h3>
            <p>{extraction.extractionMethod === 'pdf_text' ? 'Read directly from your PDF.' : 'Transcribed from your report image.'} This preview is not saved to report history.</p>
            {extraction.warnings.map((warning, index) => <p className="extraction-warning" key={index}>{warning}</p>)}
            <textarea aria-label="Extracted report text" readOnly value={extraction.extractedText} rows={12}/>
          </section>}
          <button className="primary" disabled={!file || busy} onClick={analyze}>
            {loading ? <><span className="spinner"/> Reading your report…</> : <>Explain my report <ArrowRight size={18}/></>}
          </button>
          <p className="consent"><ShieldCheck size={15}/> Your original upload is processed for this request and is not deliberately saved by ClarifyMed.</p>
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
      <small>{mapped ? 'Reference diagram based on the extracted location term—not exact model localization.' : 'No supported diagram location could be mapped reliably.'}</small>
    </div>
  );
}

function ResultVisual({ report }) {
  if (report.heatmapDataUrl) {
    return (
      <div className="body-visual heatmap">
        <img src={report.heatmapDataUrl} alt="Grad-CAM overlay showing regions that influenced the prototype model"/>
        <small>Grad-CAM model-influence overlay—not a confirmed abnormality location</small>
      </div>
    );
  }
  return report.id ? <LocationVisual location={report.location}/> : <BodyVisual/>;
}

function ResultPage({ goHome, report = demoReport, onDeleteReport }) {
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
          <span className="complete"><Check/> Explanation ready</span>
          <h1>Here’s what your report says</h1>
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
          <strong>This is an explanation, not a diagnosis.</strong>
          <span>Always discuss medical results and next steps with your healthcare professional.</span>
        </div>
      </div>
      <section className="summary-card">
        <div className="summary-copy">
          <span className="section-kicker">In plain language</span>
          <h2>{report.title}</h2>
          <p>{report.summary}</p>
        </div>
        <ResultVisual report={report}/>
      </section>
      <div className="result-grid">
        <div>
          <section className="card">
            <span className="section-kicker">Key details from the report</span>
            <div className="details">
              <div><small>Finding</small><strong>{report.finding || report.title}</strong></div>
              <div><small>Location</small><strong>{report.location}</strong></div>
              <div><small>Measurement</small><strong>{report.measurement}</strong></div>
            </div>
          </section>
          <section className="card context">
            <span className="section-kicker">What this usually means</span>
            <p>{report.context}</p>
            <div className="source-note">
              <CircleHelp/> {report.limitations || 'This is general context. Your doctor can explain what it means for you specifically.'}
            </div>
          </section>
        </div>
        <div>
          <Severity report={report}/>
          <section className="card questions">
            <span className="section-kicker">Questions for your doctor</span>
            <h3>You may want to ask:</h3>
            {report.questions.map((q, i) => (
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
          <p>Bring this explanation and your original report. Your doctor can review your health history and decide whether any follow-up is needed.</p>
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

function HistoryPage({ open, openReport, onDeleteReport }) {
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadReports = () => {
    getReports().then(setReports).catch(issue => setError(issue.message));
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
              <strong>{item.name}</strong>
              <span>{item.documentType.replaceAll('_', ' ')} · {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(item.createdAt))}</span>
            </div>
            <span className="status">{item.followUpLabel}</span>
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
  const [report, setReport] = useState(demoReport);
  const [user, setUser] = useState(null);
  const [checked, setChecked] = useState(false);
  const [navigationError, setNavigationError] = useState('');
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  useEffect(() => {
    getCurrentUser().then(result => setUser(result.user)).catch(() => {}).finally(() => setChecked(true));
  }, []);

  useEffect(() => window.scrollTo(0, 0), [page]);

  const showResult = value => {
    setNavigationError('');
    setReport(value);
    setPage('result');
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
        <HomePage onResult={showResult}/>
      ) : page === 'result' ? (
        <ResultPage key={report.id} report={report} goHome={() => setPage('home')} onDeleteReport={handleDeleteReport}/>
      ) : page === 'auth' || !user ? (
        <AuthPage onAuthenticated={value => { setUser(value); setPage('history'); }} goHome={() => setPage('home')}/>
      ) : (
        <HistoryPage open={setPage} openReport={openReport} onDeleteReport={handleDeleteReport}/>
      )}
    </Shell>
  );
}

createRoot(document.getElementById('root')).render(<AuthenticatedApp/>);
