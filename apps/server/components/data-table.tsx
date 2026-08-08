"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@workspace/ui/components/input";
import { Button } from "@workspace/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table";
import { cn } from "@workspace/ui/lib/utils";

export type DataTableColumn<T> = {
  id: string;
  header: React.ReactNode;
  /** Sort key; omit to disable sort on this column */
  sortKey?: string;
  className?: string;
  headerClassName?: string;
  cell: (row: T) => React.ReactNode;
  /** Optional plain text used by global search */
  searchValue?: (row: T) => string;
};

type SortDir = "asc" | "desc";

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  searchPlaceholder = "Search…",
  empty = "No results",
  pageSizeOptions = [10, 25, 50, 100],
  defaultPageSize = 10,
  initialSortKey,
  initialSortDir,
  onPageSizeChange,
  onSortChange,
  onRowClick,
  onRowDoubleClick,
  toolbar,
  className,
}: {
  rows: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => string;
  searchPlaceholder?: string;
  empty?: React.ReactNode;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
  initialSortKey?: string | null;
  initialSortDir?: SortDir;
  onPageSizeChange?: (size: number) => void;
  onSortChange?: (key: string | null, dir: SortDir) => void;
  onRowClick?: (row: T) => void;
  onRowDoubleClick?: (row: T) => void;
  toolbar?: React.ReactNode;
  className?: string;
}) {
  const [q, setQ] = React.useState("");
  const [internalSortKey, setInternalSortKey] = React.useState<string | null>(initialSortKey ?? null);
  const [internalSortDir, setInternalSortDir] = React.useState<SortDir>(initialSortDir ?? "asc");
  const [page, setPage] = React.useState(0);
  const [internalPageSize, setInternalPageSize] = React.useState(defaultPageSize);

  const sortKey = initialSortKey !== undefined ? initialSortKey : internalSortKey;
  const sortDir = initialSortDir !== undefined ? initialSortDir : internalSortDir;
  const pageSize = defaultPageSize !== 10 ? defaultPageSize : internalPageSize;

  React.useEffect(() => {
    if (initialSortKey !== undefined) setInternalSortKey(initialSortKey);
  }, [initialSortKey]);

  React.useEffect(() => {
    if (initialSortDir !== undefined) setInternalSortDir(initialSortDir);
  }, [initialSortDir]);

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => {
      return columns.some((col) => {
        const text =
          col.searchValue?.(row) ??
          (typeof col.cell(row) === "string" || typeof col.cell(row) === "number"
            ? String(col.cell(row))
            : "");
        return String(text).toLowerCase().includes(needle);
      });
    });
  }, [rows, q, columns]);

  const sorted = React.useMemo(() => {
    if (!sortKey) return filtered;
    const col = columns.find((c) => c.sortKey === sortKey || c.id === sortKey);
    if (!col) return filtered;
    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = col.searchValue?.(a) ?? "";
      const bv = col.searchValue?.(b) ?? "";
      const an = Number(av);
      const bn = Number(bv);
      let cmp = 0;
      if (Number.isFinite(an) && Number.isFinite(bn) && String(av).trim() !== "" && String(bv).trim() !== "") {
        cmp = an - bn;
      } else {
        cmp = String(av).localeCompare(String(bv), undefined, {
          numeric: true,
          sensitivity: "base",
        });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(
    safePage * pageSize,
    safePage * pageSize + pageSize
  );

  React.useEffect(() => {
    setPage(0);
  }, [q, pageSize, rows]);

  function toggleSort(key: string) {
    let nextDir: SortDir = "asc";
    if (sortKey === key) {
      nextDir = sortDir === "asc" ? "desc" : "asc";
    }
    setInternalSortKey(key);
    setInternalSortDir(nextDir);
    onSortChange?.(key, nextDir);
  }

  function handlePageSizeChange(v: string | null) {
    if (!v) return;
    const num = Number(v);
    setInternalPageSize(num);
    onPageSizeChange?.(num);
  }

  const pageSizeItems = Object.fromEntries(
    pageSizeOptions.map((n) => [String(n), `${n} / page`])
  );

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          className="max-w-xs"
        />
        {toolbar}
        <div className="ms-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {sorted.length} row{sorted.length === 1 ? "" : "s"}
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={handlePageSizeChange}
            items={pageSizeItems}
          >
            <SelectTrigger className="h-8 w-[7.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((n) => (
                <SelectItem key={n} value={String(n)} label={`${n} / page`}>
                  {n} / page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => {
                const key = col.sortKey || col.id;
                const sortable = Boolean(col.sortKey);
                const active = sortKey === key;
                return (
                  <TableHead key={col.id} className={col.headerClassName}>
                    {sortable ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => toggleSort(key)}
                      >
                        {col.header}
                        {active ? (
                          sortDir === "asc" ? (
                            <ArrowUp className="size-3.5" />
                          ) : (
                            <ArrowDown className="size-3.5" />
                          )
                        ) : (
                          <ArrowUpDown className="size-3.5 opacity-40" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((row) => (
              <TableRow
                key={rowKey(row)}
                className={cn(
                  (onRowClick || onRowDoubleClick) && "cursor-pointer hover:bg-muted/50"
                )}
                onClick={() => onRowClick?.(row)}
                onDoubleClick={() => onRowDoubleClick?.(row)}
              >
                {columns.map((col) => (
                  <TableCell key={col.id} className={col.className}>
                    {col.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  {empty}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="text-muted-foreground">
          Page {safePage + 1} of {pageCount}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="size-4" />
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
