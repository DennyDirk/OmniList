import type { PublishJob } from "@omnilist/shared";
import { dictionaries, formatDateTime, formatPublishJobStatus, formatPublishTargetStatus, type Locale } from "../lib/i18n";
import { publishCopy } from "../lib/publish-copy";

export function PublishJobHistory({ jobs, locale }: { jobs: PublishJob[]; locale: Locale }) {
  const text = publishCopy[locale];
  const dictionary = dictionaries[locale];
  const ordered = [...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  function renderJob(job: PublishJob) {
    return <article className="list-item" key={job.id}>
      <div className="row"><strong>{job.productTitle}</strong><span className={"pill " + (job.status === "completed" ? "ready" : job.status === "failed" ? "attention" : "")}>{formatPublishJobStatus(dictionary, job.status)}</span></div>
      <p className="field-hint">{formatDateTime(job.createdAt, locale)}</p>
      {job.targets.map(target => <div key={target.id}><div className="row"><strong>{target.channelName}</strong>{job.targets.length > 1 ? <span className="pill">{formatPublishTargetStatus(dictionary, target.status)}</span> : null}</div><p className="listing-result-message">{target.message}</p></div>)}
    </article>;
  }
  return <section className="card listing-history">
    <h2>{text.result}</h2>
    {ordered[0] ? renderJob(ordered[0]) : <p className="muted">{text.noJobs}</p>}
    {ordered.length > 1 ? <details><summary>{text.history} ({ordered.length - 1})</summary><div className="list">{ordered.slice(1).map(renderJob)}</div></details> : null}
  </section>;
}
