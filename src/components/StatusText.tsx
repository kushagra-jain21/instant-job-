import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  RotateCcw,
  Send,
  XCircle,
} from 'lucide-react';
import { JobStatus } from '../types/instantJob';

const STATUS_META: Record<
  JobStatus,
  { label: string; className: string; Icon: typeof Clock }
> = {
  open: {
    label: 'Open · Escrow Funded',
    className: 'text-blue-700',
    Icon: Lock,
  },
  accepted: {
    label: 'In Progress',
    className: 'text-amber-700',
    Icon: Clock,
  },
  submitted: {
    label: 'Submitted · Awaiting Review',
    className: 'text-indigo-700',
    Icon: Send,
  },
  changes_requested: {
    label: 'Changes Requested',
    className: 'text-amber-700',
    Icon: RotateCcw,
  },
  completed: {
    label: 'Completed · Payment Released',
    className: 'text-emerald-700',
    Icon: CheckCircle2,
  },
  cancelled: {
    label: 'Cancelled · Refunded',
    className: 'text-slate-500',
    Icon: XCircle,
  },
  disputed: {
    label: 'Disputed · Escrow Frozen',
    className: 'text-red-700',
    Icon: AlertTriangle,
  },
};

export function JobStatusText({ status }: { status: JobStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.Icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${meta.className}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{meta.label}</span>
    </span>
  );
}
