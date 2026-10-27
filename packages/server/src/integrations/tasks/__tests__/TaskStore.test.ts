import { LocalTaskStore } from '../TaskStore';
import { UnavailableDshTaskProvider } from '../../dsh/DshTaskProvider';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function buildStore() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b4-tasks-'));
    const store = new LocalTaskStore(path.join(dir, 'tasks.db'));
    return { store, dir };
}

describe('LocalTaskStore (FASE C: propuestas y sprints)', () => {
    it('creates PROPOSALS that never look assigned or executed', async () => {
        const { store } = buildStore();
        const task = await store.createProposal({ title: 'Refactor del módulo X' });
        expect(task.status).toBe('proposed');
        expect(task.origin).toBe('agentoffice');
        expect(task.dependencies).toEqual([]);
    });

    it('supports sprint grouping and backfill-free dependencies', async () => {
        const { store } = buildStore();
        const sprint = await store.createSprint({ name: 'Sprint 1', goal: 'Bloque 4' });
        const a = await store.createProposal({ title: 'Tarea A' });
        const b = await store.createProposal({ title: 'Tarea B' });
        await store.assignToSprint(a.id, sprint.id);
        await store.assignToSprint(b.id, sprint.id);
        const sprints = await store.listSprints();
        expect(sprints).toHaveLength(1);
        const inSprint = (await store.listTasks()).filter(t => t.sprintId === sprint.id);
        expect(inSprint.map(t => t.title).sort()).toEqual(['Tarea A', 'Tarea B']);
    });

    it('allows only ORGANIZATIONAL transitions for local proposals', async () => {
        const { store } = buildStore();
        const task = await store.createProposal({ title: 'Propuesta' });

        // Organizational: allowed.
        const inReview = await store.updateStatus(task.id, 'in_review');
        expect(inReview!.status).toBe('in_review');

        // Execution states: RESERVED for DSH / validated dispatch.
        await expect(store.updateStatus(task.id, 'in_progress')).rejects.toThrow(/confirmación de DSH/);
        await expect(store.updateStatus(task.id, 'completed')).rejects.toThrow(/confirmación de DSH/);
        await expect(store.updateStatus(task.id, 'assigned')).rejects.toThrow(/confirmación de DSH/);
    });

    it('rejects empty titles (no phantom tasks)', async () => {
        const { store } = buildStore();
        await expect(store.createProposal({ title: '   ' })).rejects.toThrow('title');
    });

    it('persists across reopens (SQLite, separate from Cline storage)', async () => {
        const { store, dir } = buildStore();
        await store.createProposal({ title: 'Persistente' });
        await store.close();
        const reopened = new LocalTaskStore(path.join(dir, 'tasks.db'));
        const tasks = await reopened.listTasks();
        expect(tasks.some(t => t.title === 'Persistente')).toBe(true);
        await reopened.close();
    });
});

describe('UnavailableDshTaskProvider (FASE G: contrato sin inventar)', () => {
    const provider = new UnavailableDshTaskProvider();

    it('reports itself unavailable with a clear reason', async () => {
        expect(await provider.available()).toBe(false);
        expect(provider.describe()).toContain('not-installed');
    });

    it('lists NO tasks (nothing invented)', async () => {
        expect(await provider.listTasks()).toEqual([]);
        expect(await provider.listSprints()).toEqual([]);
    });

    it('every DSH operation returns available:false with the documented reason', async () => {
        const proposal = await provider.proposeToDsh({} as any);
        expect(proposal.available).toBe(false);
        expect(proposal.reason).toContain('DSH no está instalado');

        const assignment = await provider.requestAssignment('t1');
        expect(assignment.available).toBe(false);

        const results = await provider.getResults('t1');
        expect(results.available).toBe(false);

        const blocker = await provider.notifyBlocker('t1', 'test');
        expect(blocker.available).toBe(false);
    });
});
