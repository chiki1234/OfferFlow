"use client";

import { useCallback, useState, useTransition, type FormEvent } from "react";
import { OperationModal } from "@/components/operation-modal";
import type { DashboardFormAction } from "./dashboard";

export type DashboardJobOption = {
  id: string;
  companyName: string;
  roleName: string;
};

export function DashboardTaskModal({
  jobs,
  now,
  action,
  onClose,
  onSuccess,
}: {
  jobs: DashboardJobOption[];
  now: string;
  action: DashboardFormAction;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [jobId, setJobId] = useState("");
  const [deadline, setDeadline] = useState(
    () =>
      `${new Date(new Date(now).getTime() + 8 * 3_600_000).toISOString().slice(0, 10)}T23:59`,
  );
  const [token] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const close = useCallback(() => {
    if (!pending) onClose();
  }, [onClose, pending]);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const result = await action({ error: null, success: null }, form);
        if (result.error) setError(result.error);
        else if (result.success) onSuccess(result.success);
        else setError("尚未确认保存，请重试。");
      } catch {
        setError("暂时无法保存，请检查网络后重试。");
      }
    });
  }
  return (
    <OperationModal
      title="添加待办"
      description="记下接下来要做的一件事。"
      onClose={close}
    >
      <form className="create-form" onSubmit={submit} aria-busy={pending}>
        <input type="hidden" name="idempotencyKey" value={token} />
        <label>
          待办内容
          <input
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="例如：完善作品集、准备自我介绍"
            maxLength={255}
            required
            disabled={pending}
          />
        </label>
        <label>
          关联岗位（可选）
          <select
            name="jobTrackId"
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
            disabled={pending}
          >
            <option value="">通用待办，不绑定岗位</option>
            {jobs.map((job) => (
              <option key={job.id} value={job.id}>
                {job.companyName} · {job.roleName}
              </option>
            ))}
          </select>
        </label>
        <label>
          截止时间（可选）
          <input
            name="deadlineAt"
            type="datetime-local"
            value={deadline}
            onChange={(event) => setDeadline(event.target.value)}
            disabled={pending}
          />
        </label>
        <p className="dashboard-form-hint">
          时间按北京时间记录。不设截止时间的待办不会出现在今日列表，可在关联岗位或全局待办中查看。
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dashboard-form-footer">
          <button
            className="secondary-button"
            type="button"
            disabled={pending}
            onClick={close}
          >
            取消
          </button>
          <button
            className="primary-button"
            type="submit"
            disabled={pending || !title.trim()}
          >
            {pending ? "正在创建…" : "创建待办"}
          </button>
        </div>
      </form>
    </OperationModal>
  );
}

export function DashboardProgressModal({
  job,
  action,
  onClose,
  onSuccess,
}: {
  job: { id: string; companyName: string; roleName: string };
  action: DashboardFormAction;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const [summary, setSummary] = useState("");
  const [token] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const close = useCallback(() => {
    if (!pending) onClose();
  }, [onClose, pending]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const result = await action({ error: null, success: null }, form);
        if (result.error) setError(result.error);
        else if (result.success) onSuccess(result.success);
        else setError("尚未确认保存，请重试。");
      } catch {
        setError("暂时无法保存，请检查网络后重试。");
      }
    });
  }

  return (
    <OperationModal
      title="记录跟进"
      description={`${job.companyName} · ${job.roleName}`}
      onClose={close}
    >
      <form className="create-form" onSubmit={submit} aria-busy={pending}>
        <input type="hidden" name="jobTrackId" value={job.id} />
        <input type="hidden" name="progressType" value="generic" />
        <input type="hidden" name="idempotencyKey" value={token} />
        <label>
          跟进内容
          <textarea
            name="summary"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            placeholder="例如：已联系招聘方，对方预计下周反馈"
            maxLength={2000}
            rows={5}
            required
            disabled={pending}
          />
        </label>
        <p className="dashboard-form-hint">
          只记录已经发生的联系或反馈。记录后更新最近进展，等待提醒仍按面试或测评后的等待时长判断。
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dashboard-form-footer">
          <button
            className="secondary-button"
            type="button"
            onClick={close}
            disabled={pending}
          >
            取消
          </button>
          <button
            className="primary-button"
            type="submit"
            disabled={pending || !summary.trim()}
          >
            {pending ? "正在保存…" : "保存跟进"}
          </button>
        </div>
      </form>
    </OperationModal>
  );
}
