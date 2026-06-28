"use client";

import { useState } from "react";
import type { ScanReport, Issue } from "@/lib/scanner";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#b91c1c",
  serious: "#c2410c",
  moderate: "#a16207",
  minor: "#3f6212",
};

function ScoreRing({ score }: { score: number }) {
  const color = score >= 90 ? "#15803d" : score >= 70 ? "#a16207" : "#b91c1c";
  return (
    <div className="score" style={{ borderColor: color, color }}>
      <span className="score-num">{score}</span>
      <span className="score-label">/ 100</span>
    </div>
  );
}

function IssueCard({ issue }: { issue: Issue }) {
  return (
    <div className="issue">
      <div className="issue-head">
        <span className="badge" style={{ background: SEVERITY_COLOR[issue.severity] }}>
          {issue.severity}
        </span>
        <strong>{issue.title}</strong>
        <span className="wcag">WCAG {issue.wcag}</span>
      </div>
      <p className="issue-help">{issue.help}</p>
      {issue.sample && <pre className="sample">{issue.sample}</pre>}
    </div>
  );
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ScanReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [joined, setJoined] = useState(false);

  async function runScan(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed.");
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed.");
    } finally {
      setLoading(false);
    }
  }

  async function joinWaitlist(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, url, scannedScore: report?.score }),
      });
      if (res.ok) setJoined(true);
    } catch {
      /* no-op for MVP */
    }
  }

  return (
    <main>
      <section className="hero">
        <p className="eyebrow">EU Accessibility Act · in force since June 2025</p>
        <h1>Is your website accessible — and can you prove it?</h1>
        <p className="sub">
          Scan any page for accessibility issues in seconds. Then let us monitor it
          continuously, so you always have a fresh audit trail on file.
        </p>

        <form className="scan-form" onSubmit={runScan}>
          <input
            type="text"
            inputMode="url"
            placeholder="yourwebsite.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-label="Website URL to scan"
            required
          />
          <button type="submit" disabled={loading}>
            {loading ? "Scanning…" : "Free scan"}
          </button>
        </form>
        <p className="reassure">Free · no signup · checks one public page.</p>
      </section>

      {error && <p className="error" role="alert">{error}</p>}

      {report && (
        <section className="report">
          <div className="report-top">
            <ScoreRing score={report.score} />
            <div>
              <h2>Results for {new URL(report.url).hostname}</h2>
              <p>
                {report.issues.length === 0
                  ? "No issues found by the static scan — nice."
                  : `${report.issues.length} issue type${report.issues.length > 1 ? "s" : ""} found · ${report.passed} checks passed.`}
              </p>
            </div>
          </div>

          {report.issues.map((i) => (
            <IssueCard key={i.id} issue={i} />
          ))}

          <ul className="notes">
            {report.notes.map((n, idx) => (
              <li key={idx}>{n}</li>
            ))}
          </ul>

          <div className="cta">
            <h3>Want this checked automatically every week?</h3>
            <p>
              Continuous monitoring adds rendered checks (contrast, focus, keyboard order)
              and emails you a dated report you can keep as audit evidence.
            </p>
            {joined ? (
              <p className="joined">You're on the list — we'll be in touch. ✅</p>
            ) : (
              <form className="waitlist" onSubmit={joinWaitlist}>
                <input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-label="Your email for monitoring updates"
                  required
                />
                <button type="submit">Notify me</button>
              </form>
            )}
          </div>
        </section>
      )}

      <section className="why">
        <h2>Why this matters now</h2>
        <div className="cards">
          <div>
            <h3>It's the law</h3>
            <p>The European Accessibility Act applies to most e-commerce and digital services, with penalties for non-compliance.</p>
          </div>
          <div>
            <h3>Proof, not promises</h3>
            <p>Regulators and customers want evidence. Scheduled scans give you a dated, on-file audit trail.</p>
          </div>
          <div>
            <h3>Fix what matters first</h3>
            <p>Every issue is ranked by severity with a plain-English fix — no jargon, no overlays.</p>
          </div>
        </div>
      </section>

      <footer>
        <p>
          Automated accessibility checks and audit support. This is not legal advice and does
          not guarantee compliance with any law.
        </p>
      </footer>
    </main>
  );
}
