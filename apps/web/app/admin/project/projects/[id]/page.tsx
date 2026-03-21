'use client';

export const runtime = 'edge';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAdminTenantId, withTenant } from '@/src/lib/useAdminTenantId';
import AdminTopBar from '../../../../_components/ui/AdminTopBar';

interface Task {
  id: string;
  title: string;
  completed: boolean;
}

interface Phase {
  id: string;
  name: string;
  sortOrder: number;
  tasks: Task[];
}

interface Photo {
  id: string;
  url: string;
  caption?: string;
}

interface ProjectDetail {
  id: string;
  name: string;
  customer_name: string;
  customer_phone?: string;
  customer_email?: string;
  customer_address?: string;
  status: 'draft' | 'in_progress' | 'completed' | 'cancelled';
  start_date?: string | null;
  end_date?: string | null;
  note?: string;
  createdAt: string;
  phases: Phase[];
  photos: Photo[];
}

const STATUS_LABELS: Record<string, string> = {
  draft: '下書き',
  in_progress: '進行中',
  completed: '完了',
  cancelled: 'キャンセル',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const DEMO_PROJECT: ProjectDetail = {
  id: 'demo1',
  name: '山田邸 外壁塗装工事',
  customer_name: '山田太郎',
  customer_phone: '090-1234-5678',
  customer_email: 'yamada@example.com',
  customer_address: '東京都世田谷区上北沢1-2-3',
  status: 'in_progress',
  start_date: '2026-03-15',
  end_date: '2026-04-30',
  note: '雨天時は作業中断。近隣への挨拶済み。',
  createdAt: '2026-03-10T10:00:00',
  phases: [
    {
      id: 'ph1', name: '足場設置', sortOrder: 1,
      tasks: [
        { id: 't1', title: '足場資材搬入', completed: true },
        { id: 't2', title: '足場組立', completed: true },
        { id: 't3', title: 'メッシュシート張り', completed: false },
      ],
    },
    {
      id: 'ph2', name: '高圧洗浄', sortOrder: 2,
      tasks: [
        { id: 't4', title: '外壁洗浄', completed: false },
        { id: 't5', title: '屋根洗浄', completed: false },
      ],
    },
    {
      id: 'ph3', name: '塗装工程', sortOrder: 3,
      tasks: [
        { id: 't6', title: '下塗り', completed: false },
        { id: 't7', title: '中塗り', completed: false },
        { id: 't8', title: '上塗り', completed: false },
      ],
    },
  ],
  photos: [],
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export default function ProjectDetailPage() {
  const { tenantId, status } = useAdminTenantId();
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [toast, setToast] = useState('');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', customer_name: '', customer_phone: '', customer_email: '', customer_address: '', start_date: '', end_date: '', note: '', status: 'draft' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [newPhaseName, setNewPhaseName] = useState('');
  const [addingPhase, setAddingPhase] = useState(false);
  const [newTaskInputs, setNewTaskInputs] = useState<Record<string, string>>({});
  const [addingTask, setAddingTask] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  const fetchProject = useCallback(() => {
    if (status !== 'ready') return;
    setLoading(true);
    fetch(
      `/api/proxy/admin/project/projects/${projectId}?tenantId=${encodeURIComponent(tenantId)}`,
      { cache: 'no-store' },
    )
      .then(r => {
        if (!r.ok) throw new Error('fetch failed');
        return r.json();
      })
      .then((json: any) => {
        const p = json?.data ?? json;
        if (p && p.id) {
          setProject({ ...p, phases: p.phases ?? [], photos: p.photos ?? [] });
        } else {
          setProject(DEMO_PROJECT);
          setIsDemo(true);
        }
      })
      .catch(() => {
        setProject(DEMO_PROJECT);
        setIsDemo(true);
      })
      .finally(() => setLoading(false));
  }, [tenantId, status, projectId]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    if (isDemo) {
      setProject(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phases: prev.phases.map(ph => ({
            ...ph,
            tasks: ph.tasks.map(t => t.id === taskId ? { ...t, completed: !completed } : t),
          })),
        };
      });
      return;
    }
    try {
      const res = await fetch(
        `/api/proxy/admin/project/tasks/${taskId}?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ completed: !completed }),
        },
      );
      if (!res.ok) throw new Error('update failed');
      fetchProject();
    } catch {
      showToast('タスク更新に失敗しました');
    }
  };

  const handleAddPhase = async () => {
    if (!newPhaseName.trim()) return;
    if (isDemo) {
      setProject(prev => {
        if (!prev) return prev;
        const newPhase: Phase = {
          id: `ph_${Date.now()}`,
          name: newPhaseName.trim(),
          sortOrder: prev.phases.length + 1,
          tasks: [],
        };
        return { ...prev, phases: [...prev.phases, newPhase] };
      });
      setNewPhaseName('');
      setAddingPhase(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/proxy/admin/project/projects/${projectId}/phases?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newPhaseName.trim() }),
        },
      );
      if (!res.ok) throw new Error('create failed');
      setNewPhaseName('');
      setAddingPhase(false);
      showToast('工程を追加しました');
      fetchProject();
    } catch {
      showToast('工程の追加に失敗しました');
    }
  };

  const handleAddTask = async (phaseId: string) => {
    const title = (newTaskInputs[phaseId] || '').trim();
    if (!title) return;
    if (isDemo) {
      setProject(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          phases: prev.phases.map(ph => {
            if (ph.id !== phaseId) return ph;
            return { ...ph, tasks: [...ph.tasks, { id: `t_${Date.now()}`, title, completed: false }] };
          }),
        };
      });
      setNewTaskInputs(prev => ({ ...prev, [phaseId]: '' }));
      setAddingTask(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/proxy/admin/project/phases/${phaseId}/tasks?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        },
      );
      if (!res.ok) throw new Error('create failed');
      setNewTaskInputs(prev => ({ ...prev, [phaseId]: '' }));
      setAddingTask(null);
      showToast('タスクを追加しました');
      fetchProject();
    } catch {
      showToast('タスクの追加に失敗しました');
    }
  };

  const handleStartEdit = () => {
    if (!project) return;
    setEditForm({
      name: project.name,
      customer_name: project.customer_name,
      customer_phone: project.customer_phone || '',
      customer_email: project.customer_email || '',
      customer_address: project.customer_address || '',
      start_date: project.start_date || '',
      end_date: project.end_date || '',
      note: project.note || '',
      status: project.status,
    });
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (isDemo) {
      setProject(prev => prev ? { ...prev, ...editForm, status: editForm.status as ProjectDetail['status'] } : prev);
      setEditing(false);
      showToast('更新しました（デモ）');
      return;
    }
    setSavingEdit(true);
    try {
      const res = await fetch(
        `/api/proxy/admin/project/projects/${projectId}?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editForm),
        },
      );
      if (!res.ok) throw new Error('update failed');
      setEditing(false);
      showToast('案件情報を更新しました');
      fetchProject();
    } catch {
      showToast('更新に失敗しました');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('この案件を削除しますか？この操作は取り消せません。')) return;
    if (isDemo) {
      router.push(withTenant('/admin/project/projects', tenantId));
      return;
    }
    try {
      const res = await fetch(
        `/api/proxy/admin/project/projects/${projectId}?tenantId=${encodeURIComponent(tenantId)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) throw new Error('delete failed');
      router.push(withTenant('/admin/project/projects', tenantId));
    } catch {
      showToast('削除に失敗しました');
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isDemo) {
      const url = URL.createObjectURL(file);
      setProject(prev => prev ? { ...prev, photos: [...prev.photos, { id: `photo_${Date.now()}`, url }] } : prev);
      showToast('写真を追加しました（デモ）');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(
        `/api/proxy/admin/project/projects/${projectId}/photos?tenantId=${encodeURIComponent(tenantId)}`,
        { method: 'POST', body: formData },
      );
      if (!res.ok) throw new Error('upload failed');
      showToast('写真をアップロードしました');
      fetchProject();
    } catch {
      showToast('アップロードに失敗しました');
    }
    e.target.value = '';
  };

  if (status === 'loading' || loading) {
    return (
      <>
        <AdminTopBar title="案件詳細" />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </>
    );
  }

  if (!project) {
    return (
      <>
        <AdminTopBar title="案件詳細" />
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-gray-500 font-medium">案件が見つかりませんでした</p>
        </div>
      </>
    );
  }

  const completedTasks = project.phases.reduce((sum, ph) => sum + ph.tasks.filter(t => t.completed).length, 0);
  const totalTasks = project.phases.reduce((sum, ph) => sum + ph.tasks.length, 0);

  return (
    <>
      <AdminTopBar
        title={project.name}
        subtitle={`${project.customer_name} | 作成日: ${formatDate(project.createdAt)}`}
      />

      <div className="px-6 pb-8 space-y-6 max-w-4xl">
        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg">
            {toast}
          </div>
        )}

        {isDemo && (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            デモデータ
          </div>
        )}

        {/* Project Info Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-gray-900">案件情報</h2>
            <div className="flex items-center gap-2">
              {!editing && (
                <button
                  onClick={handleStartEdit}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-amber-300 hover:text-amber-600 transition-colors"
                >
                  編集
                </button>
              )}
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[project.status] || 'bg-gray-100 text-gray-500'}`}>
                {STATUS_LABELS[project.status] || project.status}
              </span>
            </div>
          </div>

          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">案件名</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">ステータス</label>
                <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400">
                  <option value="draft">下書き</option>
                  <option value="in_progress">進行中</option>
                  <option value="completed">完了</option>
                  <option value="cancelled">キャンセル</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">顧客名</label>
                  <input type="text" value={editForm.customer_name} onChange={e => setEditForm(f => ({ ...f, customer_name: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">電話番号</label>
                  <input type="tel" value={editForm.customer_phone} onChange={e => setEditForm(f => ({ ...f, customer_phone: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">メール</label>
                  <input type="email" value={editForm.customer_email} onChange={e => setEditForm(f => ({ ...f, customer_email: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">住所</label>
                  <input type="text" value={editForm.customer_address} onChange={e => setEditForm(f => ({ ...f, customer_address: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">開始日</label>
                  <input type="date" value={editForm.start_date} onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">終了予定日</label>
                  <input type="date" value={editForm.end_date} onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">備考</label>
                <textarea value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} rows={3} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 resize-none" />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleSaveEdit} disabled={savingEdit} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-amber-600 transition-colors disabled:opacity-50">
                  {savingEdit ? '保存中...' : '保存'}
                </button>
                <button onClick={() => setEditing(false)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-300 transition-colors">
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">顧客名</p>
                <p className="font-medium text-gray-900">{project.customer_name || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">電話番号</p>
                <p className="font-medium text-gray-900">{project.customer_phone || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">メール</p>
                <p className="font-medium text-gray-900">{project.customer_email || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">住所</p>
                <p className="font-medium text-gray-900">{project.customer_address || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">開始日</p>
                <p className="font-medium text-gray-900">{formatDate(project.start_date)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">終了予定日</p>
                <p className="font-medium text-gray-900">{formatDate(project.end_date)}</p>
              </div>
              {project.note && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-gray-400 mb-0.5">備考</p>
                  <p className="font-medium text-gray-900 whitespace-pre-wrap">{project.note}</p>
                </div>
              )}
              <div className="sm:col-span-2">
                <p className="text-xs text-gray-400 mb-0.5">進捗</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: totalTasks > 0 ? `${(completedTasks / totalTasks) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-600">{completedTasks}/{totalTasks}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Phases & Tasks */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">工程・タスク</h2>
            {!addingPhase && (
              <button
                onClick={() => setAddingPhase(true)}
                className="text-sm text-amber-600 hover:text-amber-700 font-medium"
              >
                + 工程を追加
              </button>
            )}
          </div>

          <div className="divide-y divide-gray-100">
            {project.phases.map(phase => (
              <div key={phase.id} className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900">{phase.name}</h3>
                  <span className="text-xs text-gray-400">
                    {phase.tasks.filter(t => t.completed).length}/{phase.tasks.length} 完了
                  </span>
                </div>
                <div className="space-y-2">
                  {phase.tasks.map(task => (
                    <label key={task.id} className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => handleToggleTask(task.id, task.completed)}
                        className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-300"
                      />
                      <span className={`text-sm ${task.completed ? 'line-through text-gray-400' : 'text-gray-700 group-hover:text-gray-900'}`}>
                        {task.title}
                      </span>
                    </label>
                  ))}
                </div>
                {addingTask === phase.id ? (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      value={newTaskInputs[phase.id] || ''}
                      onChange={e => setNewTaskInputs(prev => ({ ...prev, [phase.id]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddTask(phase.id); }}
                      placeholder="タスク名を入力..."
                      className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                      autoFocus
                    />
                    <button onClick={() => handleAddTask(phase.id)} className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 transition-colors">
                      追加
                    </button>
                    <button onClick={() => setAddingTask(null)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:border-gray-300 transition-colors">
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingTask(phase.id)}
                    className="mt-2 text-xs text-amber-600 hover:text-amber-700 font-medium"
                  >
                    + タスクを追加
                  </button>
                )}
              </div>
            ))}

            {project.phases.length === 0 && !addingPhase && (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">
                工程はまだありません
              </div>
            )}

            {addingPhase && (
              <div className="px-5 py-4">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newPhaseName}
                    onChange={e => setNewPhaseName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddPhase(); }}
                    placeholder="工程名を入力..."
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400"
                    autoFocus
                  />
                  <button onClick={handleAddPhase} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 transition-colors">
                    追加
                  </button>
                  <button onClick={() => { setAddingPhase(false); setNewPhaseName(''); }} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 hover:border-gray-300 transition-colors">
                    取消
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Photos */}
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">現場写真</h2>
            <label className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-amber-600 transition-colors cursor-pointer">
              + 写真をアップロード
              <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            </label>
          </div>
          {project.photos.length > 0 ? (
            <div className="p-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {project.photos.map(photo => (
                <div key={photo.id} className="aspect-square rounded-xl overflow-hidden border border-gray-200">
                  <img src={photo.url} alt={photo.caption || ''} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">
              写真はまだありません
            </div>
          )}
        </div>

        {/* Delete */}
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-red-800 mb-2">危険な操作</h3>
          <p className="text-xs text-red-600 mb-3">この案件と関連するすべてのデータが削除されます。</p>
          <button
            onClick={handleDelete}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-600 transition-colors"
          >
            案件を削除する
          </button>
        </div>
      </div>
    </>
  );
}
