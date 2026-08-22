import { useEffect, useState } from "react";
import { api } from "../../lib/api/admin";
import { AdminTable, AdminPagination, AdminSearch, AdminStatusBadge, AdminLoadingState, AdminEmptyState, AdminErrorState } from "../../components/admin/AdminUI";

export function AdminContentPage() {
  const [activeTab, setActiveTab] = useState<"lessons" | "flashcards" | "exams">("lessons");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">مدیریت محتوا</h1>
        <p className="text-sm text-slate-400 mt-1">مشاهده و بررسی محتوای تولید شده</p>
      </div>

      <div className="flex gap-4 border-b border-white/10 pb-1">
        {(["lessons", "flashcards", "exams"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab ? "border-teal-500 text-teal-400" : "border-transparent text-slate-400 hover:text-slate-300"
            }`}
          >
            {tab === "lessons" ? "درس‌ها" : tab === "flashcards" ? "فلش‌کارت‌ها" : "آزمون‌ها"}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {activeTab === "lessons" && <LessonsTab />}
        {activeTab === "flashcards" && <FlashcardsTab />}
        {activeTab === "exams" && <ExamsTab />}
      </div>
    </div>
  );
}

function LessonsTab() {
  const [data, setData] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await api.get<{ lessons: any[]; totalCount: number }>(`/admin/content/lessons`, { params: { page, pageSize: 20, search } });
        if (active) { setData(res.lessons); setTotalCount(res.totalCount); setError(null); }
      } catch (err: any) {
        if (active) setError(err.message || "خطا");
      } finally {
        if (active) setLoading(false);
      }
    };
    const t = setTimeout(fetch, 300);
    return () => { active = false; clearTimeout(t); };
  }, [page, search]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><AdminSearch value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="جستجوی عنوان درس..." /></div>
      <AdminTable headers={["عنوان", "دوره", "ماژول", "وضعیت", "تاریخ ایجاد"]}>
        {loading ? <AdminLoadingState colSpan={5} /> : error ? <AdminErrorState message={error} colSpan={5} /> : data.length === 0 ? <AdminEmptyState /> : (
          data.map(item => (
            <tr key={item.id} className="hover:bg-white/5">
              <td className="px-6 py-4">{item.title}</td>
              <td className="px-6 py-4 text-slate-400">{item.courseName || "-"}</td>
              <td className="px-6 py-4 text-slate-400">{item.moduleTitle || "-"}</td>
              <td className="px-6 py-4"><AdminStatusBadge status={item.publicationStatus} /></td>
              <td className="px-6 py-4 text-slate-400" dir="ltr">{new Date(item.createdAt).toLocaleDateString("fa-IR")}</td>
            </tr>
          ))
        )}
      </AdminTable>
      <AdminPagination page={page} totalPages={Math.max(1, Math.ceil(totalCount/20))} totalCount={totalCount} onPageChange={setPage} />
    </div>
  );
}

function FlashcardsTab() {
  const [data, setData] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await api.get<{ flashcards: any[]; totalCount: number }>(`/admin/content/flashcards`, { params: { page, pageSize: 20, search } });
        if (active) { setData(res.flashcards); setTotalCount(res.totalCount); setError(null); }
      } catch (err: any) {
        if (active) setError(err.message || "خطا");
      } finally {
        if (active) setLoading(false);
      }
    };
    const t = setTimeout(fetch, 300);
    return () => { active = false; clearTimeout(t); };
  }, [page, search]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><AdminSearch value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="جستجوی روی کارت..." /></div>
      <AdminTable headers={["روی کارت", "پشت کارت", "درس", "تاریخ ایجاد"]}>
        {loading ? <AdminLoadingState colSpan={4} /> : error ? <AdminErrorState message={error} colSpan={4} /> : data.length === 0 ? <AdminEmptyState /> : (
          data.map(item => (
            <tr key={item.id} className="hover:bg-white/5">
              <td className="px-6 py-4 max-w-[200px] truncate" title={item.front}>{item.front}</td>
              <td className="px-6 py-4 max-w-[200px] truncate text-slate-400" title={item.back}>{item.back}</td>
              <td className="px-6 py-4 text-slate-400">{item.lessonTitle || "-"}</td>
              <td className="px-6 py-4 text-slate-400" dir="ltr">{new Date(item.createdAt).toLocaleDateString("fa-IR")}</td>
            </tr>
          ))
        )}
      </AdminTable>
      <AdminPagination page={page} totalPages={Math.max(1, Math.ceil(totalCount/20))} totalCount={totalCount} onPageChange={setPage} />
    </div>
  );
}

function ExamsTab() {
  const [data, setData] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetch = async () => {
      setLoading(true);
      try {
        const res = await api.get<{ exams: any[]; totalCount: number }>(`/admin/content/exams`, { params: { page, pageSize: 20, search } });
        if (active) { setData(res.exams); setTotalCount(res.totalCount); setError(null); }
      } catch (err: any) {
        if (active) setError(err.message || "خطا");
      } finally {
        if (active) setLoading(false);
      }
    };
    const t = setTimeout(fetch, 300);
    return () => { active = false; clearTimeout(t); };
  }, [page, search]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><AdminSearch value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="جستجوی عنوان آزمون..." /></div>
      <AdminTable headers={["عنوان", "نمره قبولی", "تعداد سوالات", "تاریخ ایجاد"]}>
        {loading ? <AdminLoadingState colSpan={4} /> : error ? <AdminErrorState message={error} colSpan={4} /> : data.length === 0 ? <AdminEmptyState /> : (
          data.map(item => (
            <tr key={item.id} className="hover:bg-white/5">
              <td className="px-6 py-4">{item.title}</td>
              <td className="px-6 py-4">{item.passingScore}</td>
              <td className="px-6 py-4">{item.questionCount}</td>
              <td className="px-6 py-4 text-slate-400" dir="ltr">{new Date(item.createdAt).toLocaleDateString("fa-IR")}</td>
            </tr>
          ))
        )}
      </AdminTable>
      <AdminPagination page={page} totalPages={Math.max(1, Math.ceil(totalCount/20))} totalCount={totalCount} onPageChange={setPage} />
    </div>
  );
}
