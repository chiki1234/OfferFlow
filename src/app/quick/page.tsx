import { randomUUID } from "node:crypto";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { getQuickActionOptions } from "@/modules/workspace-queries/quick-options";
import { getCurrentActor } from "@/shared/actor/current-actor";
import { QuickProgressForm, QuickTaskForm } from "./quick-forms";

export const dynamic = "force-dynamic";

export default async function QuickActionsPage() {
  const actor = await getCurrentActor();
  const options = await getQuickActionOptions(actor.userId);
  return <main className="page-stack"><header className="page-heading"><div><p className="eyebrow">全局快捷操作</p><h1>新发生的事，从这里记录。</h1><p className="page-description">新增招聘事实会自动同步岗位、Timeline、工作台和日历。</p></div></header><section className="surface-card quick-create-job"><span className="empty-icon"><Plus size={20} /></span><div><strong>新增待投递 / 已投递岗位</strong><p>保存 JD、简历与投递时间，建立新的求职主线。</p></div><Link className="primary-button" href="/jobs?create=1#create-job">去新增<ArrowRight size={16} /></Link></section><div className="quick-action-grid"><QuickProgressForm jobs={options.jobs} token={randomUUID()} currentLocal={toLocalInput(new Date())} /><QuickTaskForm jobs={options.jobs} interviews={options.interviews} unboundTasks={options.unboundTasks} token={randomUUID()} /></div></main>;
}

function toLocalInput(value: Date) { return new Date(value.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16); }
