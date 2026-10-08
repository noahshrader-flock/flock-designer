/**
 * Alert History, a new page in the Admin area.
 *
 * WHAT IT SHOWS
 *   A table of the alerts an organization received in the last 30 days, newest first, with a Status filter above it.
 *   Each row: when it arrived, the alert type, the device that raised it, a one-line detail, its status, and who
 *   handled it. Choosing a status narrows the table and the count ("6 of 24 Alerts"). When the chosen status matches
 *   nothing, the table body becomes an empty state that says why and offers Clear Filter.
 *
 * WHERE IT SITS
 *   Admin > Alert History, a new item in the Admin sub-nav directly after "Alerts & FlockOS". No such route exists
 *   today. It is a standalone page, not a tab on another page.
 *
 * MODELLED ON
 *   src/components/role/rolesPage.tsx and src/components/role/rolesList/ (page frame, title and description, grid
 *   toolbar with a count header, FSDataGrid). The empty state follows the product's centred icon / title / text /
 *   action layout (rolesListSlotComponents.tsx RolesListInitialEmptyState, alertsEmptyState.tsx).
 *
 * WHO THE NAVIGATION SHOWS
 *   A customer's own org admin (not a Flock admin): no "Organizations List" in the sub-nav and no
 *   "< Organization" back link. Top bar and the rest of the sub-nav are from
 *   .flkd/knowledge/references/admin-shell-roles-2026-10-06.png. Billing and Contact Directory are kept from that
 *   reference, but they depend on the billing permission, so a customer admin may not see them.
 *
 * STATES  (?state=default | filtered-empty)
 *   default         all 24 alerts, no filter.
 *   filtered-empty  the Status filter is set to Dismissed, which matches nothing: the empty state.
 *
 * MARKS
 *   @standin
 *     - The Alert History page and its sub-nav item. The product has no alert history today.
 *     - Alert status (New, Acknowledged, Resolved, Dismissed) and "Handled By". The product has no alert status or
 *       handling workflow; the meaning of each status is a product decision.
 *     - The empty state's Clear Filter action. The product's filtered-empty state is one line with no action
 *       (rolesListSlotComponents.tsx RolesListFilteredEmptyState). This one says why and offers the way out.
 *   @mock
 *     - The alerts, devices, plates and people.
 *     - The organization and the 30-day window ending 2026-10-08.
 *     - The top-bar app links and account menus (copied from the 2026-10-06 reference, not from the account).
 *     - The Admin sub-nav (a customer admin's; computed from permissions in the real app).
 *   @remove
 *     - The state switcher in the bottom-left corner.
 *     - The sub-nav handler that does nothing.
 */
import 'bootstrap/dist/css/bootstrap.min.css';
import '@flocksafety/flock-react-component-lib/build/style.css';

import {
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
    receivedAt: number;
    type: string;
    device: string;
    details: string;
    status: AlertStatus;
    handledBy: string | null;
};

// @mock: "now" for the 30-day window. On move: the history endpoint defines the window.
const NOW = Date.UTC(2026, 9, 8, 15, 30);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// @mock: alerts, newest first by construction. No alert history endpoint exists. On move: replace with the endpoint.
// Offsets are time before NOW. No row is Dismissed, so that filter shows the empty state.
type AlertSeed = Omit<AlertRow, 'id' | 'receivedAt'> & { ago: number };
const ALERT_SEEDS: AlertSeed[] = [];
const seed = (
    ago: number,
    type: string,
    device: string,
    details: string,
    status: AlertStatus,
    handledBy: string | null,
) => ALERT_SEEDS.push({ ago, type, device, details, status, handledBy });

seed(12 * MINUTE, 'Stolen Vehicle', 'Main St & 4th Ave, Northbound', 'Plate 7KLM294, white Ford F-150', 'New', null);
seed(47 * MINUTE, 'Wanted Person', 'Riverside Blvd & Oak St, Eastbound', 'Plate 4TRX812, linked to warrant', 'New', null);
seed(2 * HOUR, 'Gunshot Detected', 'Harbor Park Pavilion', '3 shots, confidence 94%', 'Acknowledged', 'Marcus Whitfield');
seed(3 * HOUR + 20 * MINUTE, 'Stolen Vehicle', 'County Rd 12 & Mill Rd, Southbound', 'Plate 9BNC031, gray Honda Civic', 'New', null);
seed(5 * HOUR, 'Custom Hotlist', 'Elm St & 9th Ave, Westbound', 'Plate 2HGD775, "Burglary suspect vehicle"', 'Acknowledged', 'Elena Okafor');
seed(9 * HOUR, 'Missing Person', 'Main St & 4th Ave, Southbound', 'Plate 6PWQ418, silver Toyota Camry', 'Resolved', 'Darnell Delgado');
seed(14 * HOUR, 'Stolen Vehicle', 'Lakeview Pkwy & Cedar Ln, Northbound', 'Plate 8VFA663, black Chevrolet Silverado', 'Resolved', 'Priya Brennan');
seed(1 * DAY + 2 * HOUR, 'Wanted Person', 'Riverside Blvd & Oak St, Westbound', 'Plate 3JKS940, linked to warrant', 'Resolved', 'Marcus Whitfield');
seed(1 * DAY + 11 * HOUR, 'Custom Hotlist', 'School Zone Camera 2, Eastbound', 'Plate 5LMN207, "Trespass notice"', 'Acknowledged', 'Tomas Sato');
seed(2 * DAY + 4 * HOUR, 'Gunshot Detected', 'Westgate Shopping Center, Lot B', '1 shot, confidence 81%', 'Resolved', 'Elena Okafor');
seed(2 * DAY + 19 * HOUR, 'Stolen Vehicle', 'Harbor Park Entrance, Northbound', 'Plate 1QWE558, red Dodge Ram 1500', 'Resolved', 'Alicia Holloway');
seed(3 * DAY + 6 * HOUR, 'Stolen Vehicle', 'County Rd 12 & Mill Rd, Northbound', 'Plate 7ZXC124, white Kia Soul', 'Resolved', 'Jerome Nguyen');
seed(4 * DAY + 1 * HOUR, 'Wanted Person', 'Elm St & 9th Ave, Eastbound', 'Plate 0RTY386, linked to warrant', 'Acknowledged', 'Darnell Delgado');
seed(5 * DAY + 8 * HOUR, 'Missing Person', 'Lakeview Pkwy & Cedar Ln, Southbound', 'Plate 4UIO629, blue Subaru Outback', 'Resolved', 'Hannah Castellano');
seed(6 * DAY + 13 * HOUR, 'Custom Hotlist', 'Main St & 4th Ave, Northbound', 'Plate 8ASD471, "Vehicle of interest"', 'Resolved', 'Priya Brennan');
seed(8 * DAY + 3 * HOUR, 'Stolen Vehicle', 'Riverside Blvd & Oak St, Westbound', 'Plate 6FGH802, tan Nissan Altima', 'Resolved', 'Luis Abara');
seed(9 * DAY + 17 * HOUR, 'Gunshot Detected', 'Harbor Park Pavilion', '2 shots, confidence 88%', 'Resolved', 'Marcus Whitfield');
seed(11 * DAY + 5 * HOUR, 'Wanted Person', 'School Zone Camera 2, Westbound', 'Plate 2JKL913, linked to warrant', 'Resolved', 'Tomas Sato');
seed(13 * DAY + 10 * HOUR, 'Stolen Vehicle', 'Westgate Shopping Center, Entrance', 'Plate 5ZXV350, green Jeep Cherokee', 'Resolved', 'Grace Lindqvist');
seed(16 * DAY + 21 * HOUR, 'Custom Hotlist', 'Elm St & 9th Ave, Northbound', 'Plate 9CVB284, "Burglary suspect vehicle"', 'Resolved', 'Elena Okafor');
seed(19 * DAY + 7 * HOUR, 'Missing Person', 'County Rd 12 & Mill Rd, Eastbound', 'Plate 3NMQ695, white Chevrolet Tahoe', 'Resolved', 'Alicia Holloway');
seed(22 * DAY + 14 * HOUR, 'Stolen Vehicle', 'Lakeview Pkwy & Cedar Ln, Northbound', 'Plate 7WER157, black Hyundai Elantra', 'Resolved', 'Jerome Nguyen');
seed(25 * DAY + 9 * HOUR, 'Gunshot Detected', 'Westgate Shopping Center, Lot B', '1 shot, confidence 76%', 'Resolved', 'Hannah Castellano');
seed(28 * DAY + 16 * HOUR, 'Wanted Person', 'Main St & 4th Ave, Southbound', 'Plate 1POI839, linked to warrant', 'Resolved', 'Darnell Delgado');

const ALERTS: AlertRow[] = ALERT_SEEDS.map((s, i) => ({
    id: `alert-${i + 1}`,
    receivedAt: NOW - s.ago,
    type: s.type,
    device: s.device,
    details: s.details,
    status: s.status,
    handledBy: s.handledBy,
}));

// @mock: organization name. On move: comes from the organization.
const ORG_NAME = 'Alder Creek Police Department';

const formatReceived = (ms: number) =>
    new Date(ms).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'America/Chicago',
    });

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

type PageState = 'default' | 'filtered-empty';
const PAGE_STATES: PageState[] = ['default', 'filtered-empty'];

const readState = (): PageState => {
    const value = new URLSearchParams(window.location.search).get('state');
    return PAGE_STATES.includes(value as PageState) ? (value as PageState) : 'default';
};

type StatusFilter = AlertStatus | 'All';

const STATUS_COLOR: Record<AlertStatus, 'info' | 'warning' | 'success' | undefined> = {
    New: 'info',
    Acknowledged: 'warning',
    Resolved: 'success',
    Dismissed: undefined,
};

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
    { field: 'device', headerName: 'Device', flex: 1, minWidth: 260 },
    { field: 'details', headerName: 'Details', flex: 1.2, minWidth: 280 },
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

// Filtered-empty. Follows the product's centred empty state; it keeps the grid's own frame so the table does not vanish.
const NoMatchingAlerts = ({ status, onClear }: { status: StatusFilter; onClear: () => void }) => (
    <FSGrid
        container
        direction="column"
        alignItems="center"
        justifyContent="center"
        spacing={2}
        sx={{ height: '100%' }}
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
                No alerts with the status {status} in the last 30 days. Clear the filter to see every alert.
            </FSTypography>
        </FSGrid>
        <FSGrid item>
            <FSButton variant="secondary" onClick={onClear} data-e2e-ref="clear-filter-button">
                Clear Filter
            </FSButton>
        </FSGrid>
    </FSGrid>
);

const AlertHistoryPage = ({ initialState }: { initialState: PageState }) => {
    const [status, setStatus] = useState<StatusFilter>(initialState === 'filtered-empty' ? 'Dismissed' : 'All');

    const rows = useMemo(() => (status === 'All' ? ALERTS : ALERTS.filter((a) => a.status === status)), [status]);
    const countFor = (s: AlertStatus) => ALERTS.filter((a) => a.status === s).length;
    const isEmpty = rows.length === 0;
    // The grid takes a component, not props, for its empty overlay; this one closes over the filter it is clearing.
    const noRowsOverlay = useMemo(() => {
        const Overlay = () => <NoMatchingAlerts status={status} onClear={() => setStatus('All')} />;
        return Overlay;
    }, [status]);

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
                    <FSTypography gutterBottom>
                        Alerts sent to {ORG_NAME} in the last 30 days, and how each one was handled.
                    </FSTypography>
                </FSBox>

                <FSStack spacing={1} sx={{ mb: 1 }} data-e2e-ref="alerts-toolbar">
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
                    <FSTypography variant="h6" aria-live="polite" sx={{ pt: 1 }} data-e2e-ref="alerts-count">
                        {status === 'All' ? `${ALERTS.length} Alerts` : `${rows.length} of ${ALERTS.length} Alerts`}
                    </FSTypography>
                </FSStack>

                <FSBox data-e2e-ref="alerts-table">
                    <FSDataGrid
                        aria-label="Alert history"
                        autoHeight={!isEmpty}
                        rows={rows}
                        columns={COLUMNS}
                        disableRowSelectionOnClick
                        disableColumnMenu
                        pagination
                        pageSizeOptions={[10, 25]}
                        initialState={{
                            sorting: { sortModel: [{ field: 'receivedAt', sort: 'desc' }] },
                            pagination: { paginationModel: { pageSize: 10, page: 0 } },
                        }}
                        slots={{ noRowsOverlay }}
                        hideFooter={isEmpty}
                        sx={{ height: isEmpty ? 420 : undefined, '& .MuiDataGrid-row:hover': { backgroundColor: 'inherit' } }}
                    />
                </FSBox>
            </FSBox>
        </>
    );
};

// @remove: state switcher for reviewers. On move: delete.
const StateSwitcher = ({ value, onChange }: { value: PageState; onChange: (s: PageState) => void }) => (
    <FSStack
        direction="row"
        spacing={0.5}
        alignItems="center"
        data-e2e-ref="state-switcher"
        sx={({ palette }) => ({
            position: 'fixed',
            left: 8,
            bottom: 8,
            zIndex: 2000,
            p: 0.5,
            borderRadius: 1,
            border: 1,
            borderColor: 'divider',
            bgcolor: palette.surface1.main,
        })}
    >
        <FSTypography variant="caption" color="text.secondary" sx={{ px: 1 }}>
            State
        </FSTypography>
        {PAGE_STATES.map((s) => (
            <FSButton key={s} size="sm" variant={s === value ? 'secondaryActive' : 'ghost'} onClick={() => onChange(s)}>
                {s}
            </FSButton>
        ))}
    </FSStack>
);

export default function Page() {
    const [pageState, setPageState] = useState<PageState>(readState);
    const changeState = (s: PageState) => {
        const url = new URL(window.location.href);
        url.searchParams.set('state', s);
        window.history.replaceState(null, '', url);
        setPageState(s);
    };

    return (
        <FSApp>
            <div className="app-container">
                <AlertHistoryPage key={pageState} initialState={pageState} />
                <StateSwitcher value={pageState} onChange={changeState} />
            </div>
        </FSApp>
    );
}
