/**
 * StudentResultsTable component.
 *
 * Renders the roster of students who were eligible or attempted an exam:
 *  - search by student name / email
 *  - attempt status (submitted, in_progress, timed_out, absent)
 *  - score and percentage
 *  - pass/fail badge
 *  - duration
 *  - link to view detailed answers
 */

import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmptyState,
  Badge,
  Input,
  Button,
} from "../../ui/index.js";
import type { StudentAttemptSummaryDTO } from "../../../lib/api/teacher.js";
import { Eye, Search, User, Filter } from "lucide-react";

export interface StudentResultsTableProps {
  students: StudentAttemptSummaryDTO[];
  examId: string;
}

export function StudentResultsTable({ students, examId }: StudentResultsTableProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    return students.filter((s) => {
      const matchesSearch =
        search.trim().length === 0 ||
        s.studentName.toLowerCase().includes(search.toLowerCase()) ||
        s.studentEmail.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || s.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [students, search, statusFilter]);

  return (
    <div className="space-y-3">
      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="w-full sm:w-72">
          <Input
            placeholder="جستجوی نام یا ایمیل دانش‌آموز..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            startIcon={<Search className="w-4 h-4" />}
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <FilterButton
            active={statusFilter === "all"}
            onClick={() => setStatusFilter("all")}
            label="همه"
            count={students.length}
          />
          <FilterButton
            active={statusFilter === "submitted"}
            onClick={() => setStatusFilter("submitted")}
            label="تکمیل شده"
            count={students.filter((s) => s.status === "submitted").length}
          />
          <FilterButton
            active={statusFilter === "in_progress"}
            onClick={() => setStatusFilter("in_progress")}
            label="درحال آزمون"
            count={students.filter((s) => s.status === "in_progress").length}
          />
          <FilterButton
            active={statusFilter === "absent"}
            onClick={() => setStatusFilter("absent")}
            label="غایب"
            count={students.filter((s) => s.status === "absent").length}
          />
        </div>
      </div>

      {/* Results Table */}
      <Table>
        <TableHeader>
          <TableRow hoverable={false}>
            <TableHead>دانش‌آموز</TableHead>
            <TableHead>وضعیت شرکت</TableHead>
            <TableHead>نمره / سقف</TableHead>
            <TableHead>درصد کسب‌شده</TableHead>
            <TableHead>نتیجه قبولی</TableHead>
            <TableHead>مدت زمان</TableHead>
            <TableHead className="text-center">جزئیات</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {filtered.length === 0 ? (
            <TableEmptyState
              colSpan={7}
              icon={<Filter className="w-6 h-6" />}
              message="هیچ دانش‌آموزی با این مشخصات یافت نشد."
            />
          ) : (
            filtered.map((s) => {
              const isAbsent = s.status === "absent";
              const isInProgress = s.status === "in_progress";
              const hasAttempt = !isAbsent && !isInProgress;

              return (
                <TableRow key={s.studentId}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] flex items-center justify-center shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-xs sm:text-sm text-[var(--color-text)]">
                          {s.studentName}
                        </span>
                        {s.studentEmail && (
                          <span className="text-[11px] font-mono text-[var(--color-text-muted)]">
                            {s.studentEmail}
                          </span>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    {s.status === "submitted" ? (
                      <Badge variant="success" size="sm">
                        ثبت نهایی
                      </Badge>
                    ) : s.status === "in_progress" ? (
                      <Badge variant="secondary" size="sm">
                        درحال آزمون
                      </Badge>
                    ) : s.status === "timed_out" ? (
                      <Badge variant="warning" size="sm">
                        پایان زمان
                      </Badge>
                    ) : (
                      <Badge variant="neutral" size="sm">
                        غایب
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell className="font-semibold text-xs text-[var(--color-text)]">
                    {hasAttempt && s.score !== null
                      ? `${s.score.toLocaleString("fa-IR")} از ${s.maxScore?.toLocaleString("fa-IR") ?? "—"}`
                      : "—"}
                  </TableCell>

                  <TableCell className="font-bold text-xs">
                    {hasAttempt && s.percentage !== null ? (
                      <span
                        className={
                          s.percentage >= 60
                            ? "text-emerald-600 font-black"
                            : "text-red-500 font-black"
                        }
                      >
                        {s.percentage.toLocaleString("fa-IR")}٪
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>

                  <TableCell>
                    {hasAttempt ? (
                      s.gradingStatus === "needs_manual_review" ? (
                        <Badge variant="warning" size="sm">
                          نیازمند تصحیح
                        </Badge>
                      ) : s.passed !== null ? (
                        s.passed ? (
                          <Badge variant="success" size="sm">
                            قبول
                          </Badge>
                        ) : (
                          <Badge variant="error" size="sm">
                            مردود
                          </Badge>
                        )
                      ) : (
                        <span className="text-xs text-[var(--color-text-muted)]">—</span>
                      )
                    ) : (
                      <span className="text-xs text-[var(--color-text-muted)]">—</span>
                    )}
                  </TableCell>

                  <TableCell className="text-xs text-[var(--color-text-muted)]">
                    {s.durationMinutes !== null
                      ? `${s.durationMinutes.toLocaleString("fa-IR")} دقیقه`
                      : "—"}
                  </TableCell>

                  <TableCell className="text-center">
                    {hasAttempt ? (
                      <Link to={`/teacher/exams/${examId}/results/${s.studentId}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={<Eye className="w-3.5 h-3.5" />}
                          className="text-xs px-2.5 text-[#008080]"
                        >
                          مشاهده پاسخ‌ها
                        </Button>
                      </Link>
                    ) : (
                      <span className="text-[11px] text-[var(--color-text-muted)]">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
        active
          ? "bg-[#008080] text-white"
          : "bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      }`}
    >
      <span>{label}</span>
      <span
        className={`px-1 rounded-full text-[10px] ${
          active ? "bg-white/20 text-white" : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)]"
        }`}
      >
        {count.toLocaleString("fa-IR")}
      </span>
    </button>
  );
}
