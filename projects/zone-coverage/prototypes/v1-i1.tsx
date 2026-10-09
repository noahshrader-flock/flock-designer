/**
 * Zone Coverage, a new page under Zones in the Admin area.
 *
 * WHAT IT SHOWS
 *   Every zone in the organization as a table: Zone Name, Cameras (how many are in the zone), Offline Cameras (how many
 *   of those are offline) and Last Alert (when the zone last had an alert). Above it, a search box for zone names and a
 *   "Has offline cameras" filter. The count above the table reads "14 Zones", or "3 of 14 Zones" once search or the
 *   filter narrows it. When nothing matches, the table body becomes an empty state that says so and offers Clear Filters.
 *   The table starts sorted with the most offline cameras first, so the zones that need attention are at the top.
 *
 * WHERE IT SITS
 *   Admin > Zones, as a second tab beside the existing zone list: [Zones] [Zone Coverage]. The Zones item in the
 *   sub-nav stays the active one. The real Zones route (/zones, /organization/:id/zones) has no tabs today.
 *
 * MODELLED ON
 *   src/components/zones/zonesList.tsx (page frame, title and description, count header, empty state layout),
 *   src/components/role/rolesList/rolesListSlotComponents.tsx (search, "{n} of {total}" count, filtered-empty state),
 *   src/components/alerts/alertsPage.tsx (FSTabs under the page title).
 *
 * WHO THE NAVIGATION SHOWS
 *   A customer's own org admin (not a Flock admin): no "Organizations List" in the sub-nav and no "< Organization" back
 *   link. Top bar and the rest of the sub-nav are from .flkd/knowledge/references/admin-shell-roles-2026-10-06.png.
 *   Billing and Contact Directory are kept from that reference, but they depend on the billing permission, so a
 *   customer admin may not see them.
 *
 * STATES  (?state=default | filtered)
 *   default   all 14 zones, no search, no filter.
 *   filtered  search "Riverside" with "Has offline cameras" on. Riverside has no offline cameras, so nothing matches.
 *
 * MARKS
 *   @standin
 *     - The Zone Coverage tab and page. The product has no zone coverage view today, and the Zones page has no tabs.
 *     - Camera counts, offline counts and last alert per zone. The product has zones (geojsons) and devices, but no
 *       per-zone count of cameras or offline cameras and no per-zone last alert.
 *     - The "Has offline cameras" checkbox. Coke's list filters sit in a Filters drawer (rolesList); one yes/no filter
 *       is shown inline instead.
 *     - The empty state's Clear Filters action. The product's filtered-empty state is one line with no action
 *       (rolesListSlotComponents.tsx RolesListFilteredEmptyState).
 *   @mock
 *     - The zones, camera counts, offline counts and alert dates.
 *     - "Now" (2026-10-08) and the organization.
 *     - The top-bar app links and account menus (copied from the 2026-10-06 reference, not from the account).
 *     - The Admin sub-nav (a customer admin's; computed from permissions in the real app).
 *   @remove
 *     - Picking the state from ?state= (readState). The bar above the page offers the states.
 *     - The sub-nav handler and the tab handler that do nothing (there is no zone list to switch to).
 */
import 'bootstrap/dist/css/bootstrap.min.css';
import '@flocksafety/flock-react-component-lib/build/style.css';

import {
    FSApp,
    FSBox,
    FSButton,
    FSChip,
    FSCheckbox,
    FSDataGrid,
    FSGrid,
    FSStack,
    FSSymbol,
    FSTab,
    FSTabs,
    FSTextField,
    FSTypography,
    FSUniversalNav,
} from '@flocksafety/flock-react-component-lib';
import InputAdornment from '@mui/material/InputAdornment';
import type { GridColDef } from '@mui/x-data-grid-pro';
import { useMemo, useState } from 'react';

// ---------------------------------------------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------------------------------------------

type ZoneRow = {
    id: string;
    name: string;
    cameras: number;
    offlineCameras: number;
    lastAlertAt: number | null;
};

// @mock: "now". On move: not needed, the endpoint returns the dates.
const NOW = Date.UTC(2026, 9, 8, 15, 30);
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

// @standin: per-zone camera count, offline count and last alert. No endpoint returns them. On move: add them to the
// zones response in Crown, or a coverage endpoint; offline must come from the same device status the Devices page uses.
// @mock: zones. Last alert is time before NOW; null means the zone has never had an alert.
type ZoneSeed = { name: string; cameras: number; offline: number; ago: number | null };
const ZONE_SEEDS: ZoneSeed[] = [
    { name: 'Downtown Core', cameras: 18, offline: 3, ago: 2 * HOUR },
    { name: 'Harbor Park', cameras: 9, offline: 2, ago: 1 * DAY + 4 * HOUR },
    { name: 'Westgate Shopping Center', cameras: 12, offline: 1, ago: 5 * HOUR },
    { name: 'Riverside District', cameras: 14, offline: 0, ago: 3 * DAY },
    { name: 'Lakeview Residential', cameras: 7, offline: 0, ago: 9 * DAY + 6 * HOUR },
    { name: 'County Road 12 Corridor', cameras: 6, offline: 4, ago: 21 * DAY },
    { name: 'School Zone North', cameras: 5, offline: 0, ago: 12 * DAY },
    { name: 'School Zone South', cameras: 4, offline: 1, ago: 33 * DAY },
    { name: 'Elm Street Business Strip', cameras: 8, offline: 0, ago: 6 * HOUR },
    { name: 'Industrial Park', cameras: 11, offline: 0, ago: 17 * DAY },
    { name: 'Municipal Complex', cameras: 6, offline: 0, ago: 2 * DAY + 9 * HOUR },
    { name: 'Mill Road Bridge', cameras: 3, offline: 0, ago: null },
    { name: 'Fairgrounds', cameras: 10, offline: 0, ago: 58 * DAY },
    { name: 'Oak Hill Neighborhood', cameras: 5, offline: 0, ago: 4 * DAY + 2 * HOUR },
];

const ZONES: ZoneRow[] = ZONE_SEEDS.map((s, i) => ({
    id: `zone-${i + 1}`,
    name: s.name,
    cameras: s.cameras,
    offlineCameras: s.offline,
    lastAlertAt: s.ago === null ? null : NOW - s.ago,
}));

const formatLastAlert = (ms: number) =>
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
const SUB_NAV_ITEMS = [
    'Profile', 'Organization', 'Devices', 'Roles', 'Users', 'Zones', 'Transparency Portal', 'Integrations',
    'Alerts & FlockOS', 'Billing', 'Contact Directory',
].map((title) => ({ title, value: `/${title}`, isBold: title === 'Zones' }));

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

const COLUMNS: GridColDef<ZoneRow>[] = [
    { field: 'name', headerName: 'Zone Name', flex: 1.4, minWidth: 240 },
    {
        field: 'cameras',
        headerName: 'Cameras',
        type: 'number',
        width: 150,
        align: 'left',
        headerAlign: 'left',
    },
    {
        field: 'offlineCameras',
        headerName: 'Offline Cameras',
        type: 'number',
        width: 190,
        align: 'left',
        headerAlign: 'left',
        renderCell: (params) =>
            params.row.offlineCameras > 0 ? (
                <FSChip variant="status" size="small" color="error" label={`${params.row.offlineCameras} Offline`} />
            ) : (
                <FSTypography variant="body2">0</FSTypography>
            ),
    },
    {
        field: 'lastAlertAt',
        headerName: 'Last Alert',
        type: 'number',
        flex: 1,
        minWidth: 220,
        align: 'left',
        headerAlign: 'left',
        valueFormatter: (params) =>
            params.value === null ? 'No alerts yet' : formatLastAlert(params.value as number),
        sortComparator: (a: number | null, b: number | null) => (a ?? 0) - (b ?? 0),
    },
];

// Filtered-empty. Follows the product's centred empty state; it keeps the grid's own frame so the table does not vanish.
const NoMatchingZones = ({ onClear }: { onClear: () => void }) => (
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
            <FSSymbol name="search_off" aria-hidden="true" sx={{ width: '36px', height: '36px', color: 'outline.main' }} />
        </FSGrid>
        <FSGrid item>
            <FSTypography sx={{ fontWeight: 600, fontSize: 16 }}>No Zones Found</FSTypography>
        </FSGrid>
        <FSGrid item>
            <FSTypography sx={{ fontSize: 14, maxWidth: '340px', textAlign: 'center' }}>
                No zones match your search and filter. Clear them to see every zone.
            </FSTypography>
        </FSGrid>
        <FSGrid item>
            <FSButton variant="secondary" onClick={onClear} data-e2e-ref="clear-filters-button">
                Clear Filters
            </FSButton>
        </FSGrid>
    </FSGrid>
);

const ZoneCoveragePage = ({ initialState }: { initialState: PageState }) => {
    const [search, setSearch] = useState(initialState === 'filtered' ? 'Riverside' : '');
    const [offlineOnly, setOfflineOnly] = useState(initialState === 'filtered');

    const rows = useMemo(() => {
        const term = search.trim().toLowerCase();
        return ZONES.filter(
            (z) => (!term || z.name.toLowerCase().includes(term)) && (!offlineOnly || z.offlineCameras > 0),
        );
    }, [search, offlineOnly]);

    const isEmpty = rows.length === 0;
    const clearFilters = () => {
        setSearch('');
        setOfflineOnly(false);
    };
    // The grid takes a component, not props, for its empty overlay; this one closes over the state it is clearing.
    const noRowsOverlay = useMemo(() => {
        const Overlay = () => <NoMatchingZones onClear={clearFilters} />;
        return Overlay;
    }, []);

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
            <FSStack sx={{ padding: 3 }} spacing={1.5}>
                {/* Recreated locally: the real PageTitle pulls in Redux, analytics and permissions. */}
                <FSBox sx={{ marginBottom: '1.25rem' }}>
                    <FSTypography variant="h4" component="h1" gutterBottom sx={{ marginTop: '0.75rem' }}>
                        Zones
                    </FSTypography>
                    <FSTypography variant="body2" color="text.secondary">
                        Create and manage geo-defined areas of interest for your organization.
                    </FSTypography>
                </FSBox>

                {/* @standin: tabs on the Zones page. The real page has none. On move: decide tabs or a separate route. */}
                <FSBox sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    {/* @remove: the tab handler does nothing; there is no zone list in the prototype. On move: delete. */}
                    <FSTabs value="coverage" onChange={() => undefined} aria-label="Zones Tabs">
                        <FSTab label="Zones" value="list" />
                        <FSTab label="Zone Coverage" value="coverage" data-e2e-ref="zone-coverage-tab" />
                    </FSTabs>
                </FSBox>

                <FSStack spacing={1} data-e2e-ref="zones-toolbar">
                    <FSStack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
                        <FSTextField
                            value={search}
                            onChange={setSearch}
                            placeholder="Search..."
                            size="search"
                            data-e2e-ref="zone-search"
                            inputProps={{ 'aria-label': 'Search zones' }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <FSSymbol name="search" aria-hidden="true" />
                                    </InputAdornment>
                                ),
                            }}
                            sx={{ width: { xs: '100%', sm: '565px' } }}
                        />
                        {/* @standin: inline checkbox filter. Coke's filters live in a Filters drawer. On move: put it there if the drawer is used. */}
                        <FSCheckbox
                            label="Has offline cameras"
                            checked={offlineOnly}
                            onChange={(_e, checked) => setOfflineOnly(checked)}
                            data-e2e-ref="has-offline-filter"
                        />
                    </FSStack>
                    <FSTypography variant="h6" aria-live="polite" data-e2e-ref="zones-count">
                        {rows.length < ZONES.length ? `${rows.length} of ${ZONES.length} Zones` : `${ZONES.length} Zones`}
                    </FSTypography>
                </FSStack>

                <FSBox data-e2e-ref="zones-table">
                    <FSDataGrid
                        aria-label="Zone coverage"
                        autoHeight={!isEmpty}
                        rows={rows}
                        columns={COLUMNS}
                        disableRowSelectionOnClick
                        disableColumnMenu
                        hideFooter
                        initialState={{
                            sorting: { sortModel: [{ field: 'offlineCameras', sort: 'desc' }] },
                        }}
                        slots={{ noRowsOverlay }}
                        sx={{ height: isEmpty ? 420 : undefined, '& .MuiDataGrid-row:hover': { backgroundColor: 'inherit' } }}
                    />
                </FSBox>
            </FSStack>
        </>
    );
};

export default function Page() {
    const pageState = readState();

    return (
        <FSApp>
            <div className="app-container">
                <ZoneCoveragePage initialState={pageState} />
            </div>
        </FSApp>
    );
}
