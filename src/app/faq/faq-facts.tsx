import Link from "next/link";
import { Repeat2 } from "lucide-react";

export function FaqFrequency({ count }: { count: number }) {
  return <span className="faq-frequency" title="此问题累计出现的次数"><Repeat2 size={13} />{count} 次</span>;
}

export function FaqSources({ sources }: { sources: Array<{ id: string; label: string }> }) {
  return <footer className="faq-sources">{sources.length ? <><span>来源面试 · {sources.length} 场</span><div>{sources.map((source) => <Link href={`/interviews/${source.id}`} key={source.id}>{source.label}</Link>)}</div></> : "未关联面试"}</footer>;
}
