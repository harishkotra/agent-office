import { HubSessionObserver } from '../HubSessionObserver';
import { HubSessionLauncher } from '../HubSessionLauncher';
import { AuditLog } from '../AuditLog';
import { ClineControlAdapter } from '../ClineControlAdapter';
import { ServerConfig, loadConfig } from '../../../config';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Block 5 (E2E prep): office-launched hub sessions must appear as
 * REAL characters with states derived from live hub API evidence.
 */

describe('Block 5: HubSessionObserver — hub status → office states', () => {
    function build(hubSessions: Array<{ sessionId: string; status: string }>) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b5-obs-'));
        const audit = new AuditLog(path.join(dir, 'a.jsonl'));
        const config: ServerConfig = { ...loadConfig({}), hubSessionWorkspaces: path.join(dir, 'ws') };
        const adapter = {
            listHubSessions: async () => hubSessions,
            getCapabilities: async () => ({ dispatchAvailable: true, dispatchCause: '' })
        } as unknown as ClineControlAdapter;
        const launcher = new HubSessionLauncher(config, adapter, audit);
        const observer = new HubSessionObserver(launcher, adapter);
        return { launcher, observer, adapter };
    }

    it('maps hub running → working and idle → idle with real evidence', async () => {
        const { launcher, observer } = build([{ sessionId: 's1', status: 'running' }]);
        launcher['launched'].set('s1', {
            sessionId: 's1', workspaceDir: '/tmp/ws-s1',
            startedAt: new Date().toISOString(), model: 'nvidia/z-ai/glm-5.3'
        });
        const snaps = await observer.listSnapshots();
        expect(snaps).toHaveLength(1);
        expect(snaps[0].state).toBe('working');
        expect(snaps[0].role).toBe('nvidia/z-ai/glm-5.3');
        expect(snaps[0].interactive).toBe(true);
    });

    it('hub "completed" on a LIVE interactive session means idle (turn done, session alive)', async () => {
        const { launcher, observer } = build([{ sessionId: 's1b', status: 'completed' }]);
        launcher['launched'].set('s1b', {
            sessionId: 's1b', workspaceDir: '/tmp/ws-s1b',
            startedAt: new Date().toISOString(), model: 'nvidia/z-ai/glm-5.3'
        });
        const snaps = await observer.listSnapshots();
        expect(snaps[0].state).toBe('idle');        // alive, awaiting next instruction
        expect(snaps[0].endedAt).toBeNull();        // NOT terminal
    });

    it('returns no snapshots when the office launched nothing', async () => {
        const { observer } = build([]);
        expect(await observer.listSnapshots()).toEqual([]);
    });

    it('a session MISSING from the hub is offline (never invented activity)', async () => {
        const { launcher, observer } = build([]);
        launcher['launched'].set('sX', {
            sessionId: 'sX', workspaceDir: '/tmp/ws-sX',
            startedAt: new Date().toISOString(), model: 'nvidia/z-ai/glm-5.3'
        });
        const snaps = await observer.listSnapshots();
        expect(snaps[0].state).toBe('offline');
        expect(snaps[0].rawStatus).toBe('missing');
    });

    it('stopped sessions stay visible as terminal until the office evicts them', async () => {
        const { launcher, observer } = build([]);
        launcher['stopped'].set('s3', {
            sessionId: 's3', workspaceDir: '/tmp/ws-s3',
            startedAt: new Date().toISOString(), model: 'nvidia/z-ai/glm-5.3',
            stoppedAt: new Date().toISOString()
        });
        const snaps = await observer.listSnapshots();
        expect(snaps).toHaveLength(1);
        expect(snaps[0].state).toBe('completed');
        expect(snaps[0].sessionId).toBe('s3');
    });
});
