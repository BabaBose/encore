/**
 * Report why a deploy step failed, to a URL given in `BOOKTHEACT_DIAG_URL`.
 *
 * Some hosts make build logs hard to reach. Rather than guess at a failure from
 * an exit code, the deploy step can post a short summary of what went wrong to
 * a diagnostic endpoint. It is opt-in: with no URL set, nothing is sent.
 *
 * Nothing secret ever leaves. The payload is a fixed set of fields, and every
 * string in it is scrubbed of connection strings first — a driver's own error
 * message will happily quote the URL it failed to parse, credentials included.
 */

/** Replace any connection string, and anything shaped like one, with a marker. */
export function redact(text: string): string {
  return text
    .replace(/postgres(ql)?:\/\/\S*/gi, '[redacted connection string]')
    // Belt and braces: any `user:secret@host` pair that survived the above.
    .replace(/\b[\w.-]+:[^\s/@]+@[\w.-]+/g, '[redacted credentials]');
}

export interface DeployProblem {
  step: string;
  host?: string;
  port?: string;
  problem?: string;
  errorName?: string;
  errorCode?: string;
  errorMessage?: string;
}

export async function reportDeployProblem(problem: DeployProblem): Promise<void> {
  const url = process.env.BOOKTHEACT_DIAG_URL;
  if (!url) return;

  const payload = {
    source: 'book-the-act db:push',
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    step: problem.step,
    host: problem.host ?? null,
    port: problem.port ?? null,
    problem: problem.problem ? redact(problem.problem) : null,
    errorName: problem.errorName ?? null,
    errorCode: problem.errorCode ?? null,
    errorMessage: problem.errorMessage ? redact(problem.errorMessage).slice(0, 600) : null,
  };

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Diagnostics must never be the reason a build fails.
  }
}
