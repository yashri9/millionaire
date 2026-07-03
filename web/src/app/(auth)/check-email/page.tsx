/** PRD §4.1 "check your email" screen shown right after signup. */
export default function CheckEmailPage() {
  return (
    <>
      <h1>Check your email</h1>
      <p className="muted">
        We sent you a verification link. You can start uploading and drafting
        right away — you&apos;ll need to verify before publishing.
      </p>
      <button className="btn ghost" style={{ marginTop: 12 }}>
        Resend email
      </button>
    </>
  );
}
