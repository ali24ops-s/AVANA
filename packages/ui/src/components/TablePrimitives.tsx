import React, { ReactNode } from "react";
import { AlertTriangle, Filter } from "lucide-react";

export interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode;
  className?: string;
  containerClassName?: string;
}

export const Table: React.FC<TableProps> = ({
  children,
  className = "",
  containerClassName = "",
  ...props
}) => {
  return (
    <div
      className={`w-full overflow-x-auto rounded-[16px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-subtle,0_1px_3px_rgba(0,0,0,0.06))] ${containerClassName}`}
    >
      <table className={`w-full text-start border-collapse ${className}`} {...props}>
        {children}
      </table>
    </div>
  );
};

export interface TableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode;
  className?: string;
}

export const TableHeader: React.FC<TableHeaderProps> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <thead
      className={`border-b border-[var(--color-border)] bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] text-xs font-semibold ${className}`}
      {...props}
    >
      {children}
    </thead>
  );
};

export interface TableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: ReactNode;
  className?: string;
}

export const TableBody: React.FC<TableBodyProps> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <tbody
      className={`divide-y divide-[var(--color-border)] text-[var(--color-text)] text-xs sm:text-sm ${className}`}
      {...props}
    >
      {children}
    </tbody>
  );
};

export interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: ReactNode;
  className?: string;
  hoverable?: boolean;
}

export const TableRow: React.FC<TableRowProps> = ({
  children,
  className = "",
  hoverable = true,
  ...props
}) => {
  return (
    <tr
      className={`transition-colors ${
        hoverable ? "hover:bg-[var(--color-surface-warm)]/60" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </tr>
  );
};

export interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  children?: ReactNode;
  className?: string;
}

export const TableHead: React.FC<TableHeadProps> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <th
      className={`px-4 py-3.5 text-start font-semibold whitespace-nowrap text-xs text-[var(--color-text-muted)] ${className}`}
      {...props}
    >
      {children}
    </th>
  );
};

export interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  children?: ReactNode;
  className?: string;
}

export const TableCell: React.FC<TableCellProps> = ({
  children,
  className = "",
  ...props
}) => {
  return (
    <td
      className={`px-4 py-3.5 align-middle text-start text-[var(--color-text)] ${className}`}
      {...props}
    >
      {children}
    </td>
  );
};

export interface TableEmptyStateProps {
  message?: string;
  colSpan?: number;
  icon?: ReactNode;
  action?: ReactNode;
}

export const TableEmptyState: React.FC<TableEmptyStateProps> = ({
  message = "رکوردی یافت نشد.",
  colSpan = 100,
  icon,
  action,
}) => {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-12 text-center text-[var(--color-text-muted)]">
        <div className="flex flex-col items-center justify-center gap-2">
          <div className="w-12 h-12 rounded-[16px] bg-[var(--color-surface-warm)] border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-muted)]">
            {icon || <Filter className="w-6 h-6" />}
          </div>
          <p className="text-sm font-medium text-[var(--color-text)]">{message}</p>
          {action && <div className="mt-2">{action}</div>}
        </div>
      </td>
    </tr>
  );
};

export interface TableLoadingStateProps {
  colSpan?: number;
  message?: string;
}

export const TableLoadingState: React.FC<TableLoadingStateProps> = ({
  colSpan = 100,
  message = "در حال بارگذاری...",
}) => {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-8 text-center text-[var(--color-text-muted)]">
        <div className="flex items-center justify-center gap-2">
          <div className="w-5 h-5 border-2 border-[var(--color-border)] border-t-[#008080] rounded-full animate-spin" />
          <span className="text-xs sm:text-sm font-medium">{message}</span>
        </div>
      </td>
    </tr>
  );
};

export interface TableErrorStateProps {
  colSpan?: number;
  message: string;
}

export const TableErrorState: React.FC<TableErrorStateProps> = ({
  colSpan = 100,
  message,
}) => {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-8 text-center text-[#b84c4c] dark:text-red-300">
        <div className="flex flex-col items-center justify-center gap-2">
          <AlertTriangle className="w-6 h-6 text-[#b84c4c] dark:text-red-300" />
          <p className="text-xs sm:text-sm font-medium">{message}</p>
        </div>
      </td>
    </tr>
  );
};
