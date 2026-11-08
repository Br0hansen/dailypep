import { PeptidesView } from './PeptidesView';
import type { ViewProps } from './shared';

/** Inventory owns peptide metadata and containers; scheduling lives in Plans. */
export function InventoryView(props: ViewProps & { onAddPlan: () => void }) {
  return <PeptidesView {...props}/>;
}
