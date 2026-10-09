/**
 * Alert History, grouped by device. A different idea from v1-i1's flat table.
 *
 * WHAT IT SHOWS
 *   The alerts an organization received in the last 30 days, grouped under the device that raised them. Each group
 *   is a collapsible row showing the device name, how many alerts it raised, when the latest one arrived, and a chip
 *   per status ("1 New", "2 Resolved"). Opening a group shows that device's alerts in a small table. Devices that
 *   still have New or Acknowledged alerts come first, so the page answers "which devices need attention" before
 *   "what happened". A Status filter narrows every group at once and hides devices with no matching alerts. When the
 *   chosen status matches nothing, the groups are replaced by an empty state that offers Clear Filter.
 *   "Camera" in the request is written "Device" here: the product renamed cameras to Devices.
 *
 * WHERE IT SITS
 *   Admin > Alert History, a new item in the Admin sub-nav directly after "Alerts & FlockOS". No such route exists
 *   today. It is a standalone page, not a tab on another page.
 *
 * MODELLED ON
 *   src/components/role/rolesPage.tsx (page frame, title, count line) and
 *   src/components/alerts/alertPreferences/alertSourcesAccordion.tsx (the product's one grouped list: an FSAccordion
 *   per source, name as an h3 and a "n Enabled Topics" line in the summary, a table inside). The empty state follows
 *   rolesListSlotComponents.tsx RolesListInitialEmptyState.
 *
 * WHO THE NAVIGATION SHOWS
 *   A customer's own org admin (not a Flock admin): no "Organizations List" in the sub-nav and no
 *   "< Organization" back link. Top bar and the rest of the sub-nav are from
 *   .flkd/knowledge/references/admin-shell-roles-2026-10-06.png. Billing and Contact Directory are kept from that
 *   reference, but they depend on the billing permission, so a customer admin may not see them.
 *
 * STATES  (?state=default | filtered)
 *   default   all 24 alerts across 8 devices, no filter. The first group (most in need of attention) is open.
 *   filtered  the Status filter is set to Dismissed, which matches nothing: the empty state.
 *
 * MARKS
 *   @standin
 *     - The Alert History page and its sub-nav item. The product has no alert history today.
 *     - Alert status (New, Acknowledged, Resolved, Dismissed) and "Handled By". The product has no alert status or
 *       handling workflow; the meaning of each status is a product decision.
 *     - Grouping by device and ordering groups by what needs attention. The product has no such grouped history.
 *     - Expand All / Collapse All. The product's accordions have no such control.
 *     - The empty state's Clear Filter action. The product's filtered-empty state is one line with no action
 *       (rolesListSlotComponents.tsx RolesListFilteredEmptyState). This one says why and offers the way out.
 *   @mock
 *     - The alerts, devices, plates and people.
 *     - The 30-day window ending 2026-10-08.
 *     - The top-bar app links and account menus (copied from the 2026-10-06 reference, not from the account).
 *     - The Admin sub-nav (a customer admin's; computed from permissions in the real app).
 *   @remove
 *     - Picking the state from ?state= (readState). The bar above the page offers the states.
 *     - The sub-nav handler that does nothing.
 */
import 'bootstrap/dist/css/bootstrap.min.css';
import '@flocksafety/flock-react-component-lib/build/style.css';

import {
    FSAccordion,
    FSAccordionDetails,
    FSAccordionSummary,
    FSApp,
    FSBox,
    FSButton,
    FSChip,
    FSDataGrid,
    FSGrid,
    FSMenuItem,
    FSSelect,
    FSStack,
    FSSymbol,
    FSTypography,
    FSUniversalNav,
} from '@flocksafety/flock-react-component-lib';
import type { GridColDef } from '@mui/x-data-grid-pro';
import { useMemo, useState } from 'react';

// ---------------------------------------------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------------------------------------------

// @standin: alert status. No alert status exists in the product. On move: decide the statuses and who may set them.
type AlertStatus = 'New' | 'Acknowledged' | 'Resolved' | 'Dismissed';
const STATUSES: AlertStatus[] = ['New', 'Acknowledged', 'Resolved', 'Dismissed'];

type AlertRow = {
    id: string;
    deviceId: string;
    receivedAt: number;
    type: string;
    details: string;
    status: AlertStatus;
    handledBy: string | null;
};

// @mock: devices. On move: comes from the organization's devices.
const DEVICES: { id: string; name: string }[] = [
    { id: 'main-4th', name: 'Main St & 4th Ave' },
    { id: 'riverside-oak', name: 'Riverside Blvd & Oak St' },
    { id: 'county-mill', name: 'County Rd 12 & Mill Rd' },
    { id: 'elm-9th', name: 'Elm St & 9th Ave' },
    { id: 'harbor-pavilion', name: 'Harbor Park Pavilion' },
    { id: 'school-zone', name: 'School Zone Camera 2' },
    { id: 'lakeview-cedar', name: 'Lakeview Pkwy & Cedar Ln' },
    { id: 'westgate', name: 'Westgate Shopping Center' },
];

// @mock: "now" for the 30-day window. On move: the history endpoint defines the window.
const NOW = Date.UTC(2026, 9, 8, 15, 30);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type AlertSeed = Omit<AlertRow, 'id' | 'receivedAt'> & { ago: number };
const SEEDS: AlertSeed[] = [];
const seed = (
    ago: number,
    deviceId: string,
    type: string,
    details: string,
    status: AlertStatus,
    handledBy: string | null,
) => SEEDS.push({ ago, deviceId, type, details, status, handledBy });

// @mock: alerts. No alert history endpoint exists. On move: replace with the endpoint. Offsets are time before NOW.
// No row is Dismissed, so that filter shows the empty state.
seed(12 * MINUTE, 'main-4th', 'Stolen Vehicle', 'Plate 7KLM294, white Ford F-150, northbound', 'New', null);
seed(47 * MINUTE, 'riverside-oak', 'Wanted Person', 'Plate 4TRX812, linked to warrant, eastbound', 'New', null);
seed(2 * HOUR, 'harbor-pavilion', 'Gunshot Detected', '3 shots, confidence 94%', 'Acknowledged', 'Marcus Whitfield');
seed(3 * HOUR + 20 * MINUTE, 'county-mill', 'Stolen Vehicle', 'Plate 9BNC031, gray Honda Civic, southbound', 'New', null);
seed(5 * HOUR, 'elm-9th', 'Custom Hotlist', 'Plate 2HGD775, "Burglary suspect vehicle", westbound', 'Acknowledged', 'Elena Okafor');
seed(9 * HOUR, 'main-4th', 'Missing Person', 'Plate 6PWQ418, silver Toyota Camry, southbound', 'Resolved', 'Darnell Delgado');
seed(14 * HOUR, 'lakeview-cedar', 'Stolen Vehicle', 'Plate 8VFA663, black Chevrolet Silverado, northbound', 'Resolved', 'Priya Brennan');
seed(1 * DAY + 2 * HOUR, 'riverside-oak', 'Wanted Person', 'Plate 3JKS940, linked to warrant, westbound', 'Resolved', 'Marcus Whitfield');
seed(1 * DAY + 11 * HOUR, 'school-zone', 'Custom Hotlist', 'Plate 5LMN207, "Trespass notice", eastbound', 'Acknowledged', 'Tomas Sato');
seed(2 * DAY + 4 * HOUR, 'westgate', 'Gunshot Detected', '1 shot, confidence 81%', 'Resolved', 'Elena Okafor');
seed(2 * DAY + 19 * HOUR, 'lakeview-cedar', 'Stolen Vehicle', 'Plate 1QWE558, red Dodge Ram 1500, northbound', 'Resolved', 'Alicia Holloway');
seed(3 * DAY + 6 * HOUR, 'county-mill', 'Stolen Vehicle', 'Plate 7ZXC124, white Kia Soul, northbound', 'Resolved', 'Jerome Nguyen');
seed(4 * DAY + 1 * HOUR, 'elm-9th', 'Wanted Person', 'Plate 0RTY386, linked to warrant, eastbound', 'Acknowledged', 'Darnell Delgado');
seed(5 * DAY + 8 * HOUR, 'lakeview-cedar', 'Missing Person', 'Plate 4UIO629, blue Subaru Outback, southbound', 'Resolved', 'Hannah Castellano');
seed(6 * DAY + 13 * HOUR, 'main-4th', 'Custom Hotlist', 'Plate 8ASD471, "Vehicle of interest", northbound', 'Resolved', 'Priya Brennan');
seed(8 * DAY + 3 * HOUR, 'riverside-oak', 'Stolen Vehicle', 'Plate 6FGH802, tan Nissan Altima, westbound', 'Resolved', 'Luis Abara');
seed(9 * DAY + 17 * HOUR, 'harbor-pavilion', 'Gunshot Detected', '2 shots, confidence 88%', 'Resolved', 'Marcus Whitfield');
seed(11 * DAY + 5 * HOUR, 'school-zone', 'Wanted Person', 'Plate 2JKL913, linked to warrant, westbound', 'Resolved', 'Tomas Sato');
seed(13 * DAY + 10 * HOUR, 'westgate', 'Stolen Vehicle', 'Plate 5ZXV350, green Jeep Cherokee, entrance', 'Resolved', 'Grace Lindqvist');
seed(16 * DAY + 21 * HOUR, 'elm-9th', 'Custom Hotlist', 'Plate 9CVB284, "Burglary suspect vehicle", northbound', 'Resolved', 'Elena Okafor');
seed(19 * DAY + 7 * HOUR, 'county-mill', 'Missing Person', 'Plate 3NMQ695, white Chevrolet Tahoe, eastbound', 'Resolved', 'Alicia Holloway');
seed(22 * DAY + 14 * HOUR, 'lakeview-cedar', 'Stolen Vehicle', 'Plate 7WER157, black Hyundai Elantra, northbound', 'Resolved', 'Jerome Nguyen');
seed(25 * DAY + 9 * HOUR, 'westgate', 'Gunshot Detected', '1 shot, confidence 76%', 'Resolved', 'Hannah Castellano');
seed(28 * DAY + 16 * HOUR, 'main-4th', 'Wanted Person', 'Plate 1POI839, linked to warrant, southbound', 'Resolved', 'Darnell Delgado');

const ALERTS: AlertRow[] = SEEDS.map((s, i) => ({
    id: `alert-${i + 1}`,
    deviceId: s.deviceId,
    receivedAt: NOW - s.ago,
    type: s.type,
    details: s.details,
    status: s.status,
    handledBy: s.handledBy,
}));

const formatReceived = (ms: number) =>
    new Date(ms).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Chicago',
    });

const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

// @mock: top-bar links come from the signed-in account (loggedInUser.nav), which has no current fixture. Copied
// from .flkd/knowledge/references/admin-shell-roles-2026-10-06.png.
const EXTERNAL_APP_LINKS = [
    'Search', 'Alerts', 'Patrol', 'FlockOS', 'Nova', 'VMS', 'Devices', 'Sharing', 'Insights', 'Evidence', 'Admin',
    'Planning Center',
].map((title) => ({ title, url: '#', isInternal: true }));

const HELP_ITEM = {
    title: 'Help',
    options: [{ title: 'Help Center', url: '#' }, { title: 'Contact Support', url: '#' }],
};
const USER_DETAILS_ITEM = {
    title: 'Account',
    options: [{ title: 'Sign Out', url: '#' }],
};

// @mock: sub-nav for a customer's own org admin. On move: computed by useAdminSubNavItems from permissions.
// @standin: the "Alert History" item. It does not exist today. On move: add it to useAdminSubNavItems behind its permission.
const SUB_NAV_ITEMS = [
    'Profile', 'Organization', 'Devices', 'Roles', 'Users', 'Zones', 'Transparency Portal', 'Integrations',
    'Alerts & FlockOS', 'Alert History', 'Billing', 'Contact Directory',
].map((title) => ({ title, value: `/${title}`, isBold: title === 'Alert History' }));

// ---------------------------------------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------------------------------------

// The states, for the bar above the page to offer; the first is what the page opens in.
export const states = ['default', 'filtered'] as const;
type PageState = (typeof states)[number];

// @remove: picks the state from ?state=. On move: delete.
const readState = (): PageState => {
    const value = new URLSearchParams(window.location.search).get('state');
    return states.includes(value as PageState) ? (value as PageState) : states[0];
};

type StatusFilter = AlertStatus | 'All';

const STATUS_COLOR: Record<AlertStatus, 'info' | 'warning' | 'success' | undefined> = {
    New: 'info',
    Acknowledged: 'warning',
    Resolved: 'success',
    Dismissed: undefined,
};

// The device column is gone: the group already says which device these are.
const COLUMNS: GridColDef<AlertRow>[] = [
    {
        field: 'receivedAt',
        headerName: 'Received',
        type: 'number',
        width: 200,
        align: 'left',
        headerAlign: 'left',
        valueFormatter: (params) => formatReceived(params.value as number),
    },
    { field: 'type', headerName: 'Alert Type', width: 160 },
    { field: 'details', headerName: 'Details', flex: 1, minWidth: 300 },
    {
        field: 'status',
        headerName: 'Status',
        width: 150,
        renderCell: (params) => (
            <FSChip variant="status" size="small" color={STATUS_COLOR[params.row.status]} label={params.row.status} />
        ),
    },
    {
        field: 'handledBy',
        headerName: 'Handled By',
        width: 190,
        valueFormatter: (params) => (params.value as string | null) ?? 'Not yet handled',
    },
];

type DeviceGroup = { id: string; name: string; alerts: AlertRow[]; latest: number; counts: Record<AlertStatus, number> };

// Groups with something to act on first, then by most recent alert.
const buildGroups = (alerts: AlertRow[]): DeviceGroup[] =>
    DEVICES.map((d) => {
        const own = alerts.filter((a) => a.deviceId === d.id);
        const counts: Record<AlertStatus, number> = { New: 0, Acknowledged: 0, Resolved: 0, Dismissed: 0 };
        own.forEach((a) => {
            counts[a.status] += 1;
        });
        return { id: d.id, name: d.name, alerts: own, latest: Math.max(0, ...own.map((a) => a.receivedAt)), counts };
    })
        .filter((g) => g.alerts.length > 0)
        .sort((a, b) => b.counts.New - a.counts.New || b.counts.Acknowledged - a.counts.Acknowledged || b.latest - a.latest);

const NoMatchingAlerts = ({ status, onClear }: { status: StatusFilter; onClear: () => void }) => (
    <FSGrid
        container
        direction="column"
        alignItems="center"
        spacing={2}
        sx={{ mt: 7 }}
        data-e2e-ref="empty-state"
    >
        <FSGrid item>
            <FSSymbol name="notifications_off" aria-hidden="true" sx={{ width: '36px', height: '36px', color: 'outline.main' }} />
        </FSGrid>
        <FSGrid item>
            <FSTypography sx={{ fontWeight: 600, fontSize: 16 }}>No Alerts Found</FSTypography>
        </FSGrid>
        <FSGrid item>
            <FSTypography sx={{ fontSize: 14, maxWidth: '340px', textAlign: 'center' }}>
                No device has an alert with the status {status} in the last 30 days. Clear the filter to see every
                device.
            </FSTypography>
        </FSGrid>
        <FSGrid item>
            <FSButton variant="secondary" onClick={onClear} data-e2e-ref="clear-filter-button">
                Clear Filter
            </FSButton>
        </FSGrid>
    </FSGrid>
);

const DeviceGroupRow = ({
    group,
    expanded,
    onToggle,
}: {
    group: DeviceGroup;
    expanded: boolean;
    onToggle: (open: boolean) => void;
}) => (
    <FSAccordion
        expanded={expanded}
        onChange={(_e, open) => onToggle(open)}
        slotProps={{ transition: { unmountOnExit: true } }}
        data-e2e-ref={`device-group-${group.id}`}
    >
        <FSAccordionSummary id={`${group.id}-summary`} aria-controls={`${group.id}-alerts`}>
            <FSStack py={1}>
                <FSTypography fontWeight="bold" gutterBottom component="h2">
                    {group.name}
                </FSTypography>
                <FSTypography variant="subtitle2" component="p">
                    <strong>{group.alerts.length}</strong> {group.alerts.length === 1 ? 'Alert' : 'Alerts'}
                </FSTypography>
                <FSTypography variant="caption" color="text.secondary" component="p">
                    Latest alert {formatReceived(group.latest)}
                </FSTypography>
            </FSStack>
            <FSBox flexGrow={1} />
            <FSStack direction="row" spacing={1} alignItems="center" sx={{ pr: 1 }}>
                {STATUSES.filter((s) => group.counts[s] > 0).map((s) => (
                    <FSChip
                        key={s}
                        variant="status"
                        size="small"
                        color={STATUS_COLOR[s]}
                        label={`${group.counts[s]} ${s}`}
                    />
                ))}
            </FSStack>
        </FSAccordionSummary>
        <FSAccordionDetails id={`${group.id}-alerts`}>
            <FSDataGrid
                aria-label={`Alerts for ${group.name}`}
                autoHeight
                hideFooter
                disableRowSelectionOnClick
                disableColumnMenu
                rows={group.alerts}
                columns={COLUMNS}
                initialState={{ sorting: { sortModel: [{ field: 'receivedAt', sort: 'desc' }] } }}
                sx={{ '& .MuiDataGrid-row:hover': { backgroundColor: 'inherit' } }}
            />
        </FSAccordionDetails>
    </FSAccordion>
);

const AlertHistoryPage = ({ initialState }: { initialState: PageState }) => {
    const [status, setStatus] = useState<StatusFilter>(initialState === 'filtered' ? 'Dismissed' : 'All');

    const matching = useMemo(() => (status === 'All' ? ALERTS : ALERTS.filter((a) => a.status === status)), [status]);
    const groups = useMemo(() => buildGroups(matching), [matching]);
    // The group that most needs attention starts open; the rest start closed.
    const [open, setOpen] = useState<string[]>(() => {
        const first = buildGroups(ALERTS)[0];
        return initialState === 'default' && first ? [first.id] : [];
    });
    const countFor = (s: AlertStatus) => ALERTS.filter((a) => a.status === s).length;
    const allOpen = groups.length > 0 && groups.every((g) => open.includes(g.id));

    const acrossDevices = groups.length > 0 ? ` across ${plural(groups.length, 'Device')}` : '';
    const countText =
        status === 'All'
            ? `${plural(ALERTS.length, 'Alert')}${acrossDevices}`
            : `${matching.length} of ${plural(ALERTS.length, 'Alert')}${acrossDevices}`;

    return (
        <>
            <FSUniversalNav
                navbarTitle="Admin"
                logoHref="#"
                externalAppLinkItems={EXTERNAL_APP_LINKS}
                helpLinkItem={HELP_ITEM}
                userDetailsItem={USER_DETAILS_ITEM}
                activeAppLinkItems={SUB_NAV_ITEMS}
                // @remove: the sub-nav does nothing in the prototype. On move: delete.
                activeAppNavigationHandler={() => undefined}
            />
            <FSBox sx={{ padding: 3 }}>
                {/* Recreated locally: the real PageTitle pulls in Redux, analytics and permissions. */}
                <FSBox sx={{ marginBottom: '1.25rem' }}>
                    <FSTypography variant="h4" component="h1" gutterBottom sx={{ marginTop: '0.75rem' }}>
                        Alert History
                    </FSTypography>
                </FSBox>

                <FSStack spacing={1} sx={{ mb: 2 }} data-e2e-ref="alerts-toolbar">
                    <FSBox sx={{ width: { xs: '100%', sm: '280px' } }}>
                        <FSSelect
                            label="Status"
                            value={status}
                            onChange={(e) => setStatus(e.target.value as StatusFilter)}
                            fullWidth
                        >
                            <FSMenuItem value="All">All Statuses ({ALERTS.length})</FSMenuItem>
                            {STATUSES.map((s) => (
                                <FSMenuItem key={s} value={s}>
                                    {s} ({countFor(s)})
                                </FSMenuItem>
                            ))}
                        </FSSelect>
                    </FSBox>
                    <FSStack direction="row" alignItems="flex-end" sx={{ pt: 1 }}>
                        <FSTypography variant="h6" aria-live="polite" data-e2e-ref="alerts-count">
                            {countText}
                        </FSTypography>
                        <FSBox flexGrow={1} />
                        {groups.length > 0 && (
                            // @standin: Expand All / Collapse All. No such control exists on the product's accordions.
                            // On move: keep it if groups stay this long, or drop it.
                            <FSButton
                                variant="ghost"
                                size="sm"
                                onClick={() => setOpen(allOpen ? [] : groups.map((g) => g.id))}
                                data-e2e-ref="expand-all-button"
                            >
                                {allOpen ? 'Collapse All' : 'Expand All'}
                            </FSButton>
                        )}
                    </FSStack>
                </FSStack>

                {groups.length === 0 ? (
                    <NoMatchingAlerts status={status} onClear={() => setStatus('All')} />
                ) : (
                    <FSBox data-e2e-ref="device-groups">
                        {groups.map((g) => (
                            <DeviceGroupRow
                                key={g.id}
                                group={g}
                                expanded={open.includes(g.id)}
                                onToggle={(isOpen) =>
                                    setOpen((prev) => (isOpen ? [...prev, g.id] : prev.filter((id) => id !== g.id)))
                                }
                            />
                        ))}
                    </FSBox>
                )}
            </FSBox>
        </>
    );
};

export default function Page() {
    const pageState = readState();

    return (
        <FSApp>
            <div className="app-container">
                <AlertHistoryPage initialState={pageState} />
            </div>
        </FSApp>
    );
}
