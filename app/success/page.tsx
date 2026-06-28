export default function SuccessPage() {
  return (
    <main style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: "64px", marginBottom: "16px" }}>✅</div>
      <h1>You&apos;re set up.</h1>
      <p style={{ color: "#6b7280", maxWidth: "480px", margin: "0 auto 32px" }}>
        Your site will be scanned every week and you&apos;ll receive a prioritised accessibility
        report by email. First report arrives within 7 days.
      </p>
      <p style={{ color: "#6b7280", fontSize: "14px" }}>
        Questions? Reply to any report email or visit{" "}
        <a href="/" style={{ color: "#2563eb" }}>accessibility-monitor.vercel.app</a>.
      </p>
    </main>
  );
}
