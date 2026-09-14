import { useMemo, useState } from 'react';
import { useStorageList, useStorageTree } from '@/hooks/queries';
import type { StorageNode } from '@/api/types';
import { ChevronRight, InboxIcon, StorageIcon } from './Icons';
import { Input } from './ui/Field';
import { EmptyState, SkeletonList } from './ui/Feedback';
import './StorageTree.css';

interface Props {
  placeId: string;
  value: string | null;
  onChange: (storageId: string | null) => void;
  /** Offer an explicit "not put away" choice (items can live outside any storage). */
  allowNone?: boolean;
  noneLabel?: string;
  /** Ids that cannot be chosen — e.g. a storage's own subtree when moving it. */
  disabledIds?: Set<string>;
}

export function StorageTreePicker({
  placeId, value, onChange, allowNone, noneLabel = 'Not put away yet', disabledIds,
}: Props) {
  const [query, setQuery] = useState('');
  const searching = query.trim().length >= 1;

  const tree = useStorageTree(placeId);
  // The flat list already carries a ready-made breadcrumb, which is exactly what a
  // search result needs — no need to reconstruct a path from the tree.
  const flat = useStorageList(placeId, searching ? { q: query.trim() } : undefined);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Auto-expand the branches holding the current selection on first load.
  const autoExpanded = useMemo(() => {
    if (!value || !tree.data) return expanded;
    const found = findPath(tree.data, value);
    if (!found) return expanded;
    const merged = new Set(expanded);
    found.forEach((id) => merged.add(id));
    return merged;
  }, [value, tree.data, expanded]);

  const isLoading = searching ? flat.isLoading : tree.isLoading;

  return (
    <div className="stack gap-3">
      <Input
        type="search"
        placeholder="Search storages…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search storages"
      />

      {allowNone && (
        <button
          type="button"
          className="tree-row"
          aria-selected={value === null}
          onClick={() => onChange(null)}
        >
          <span className="tree-spacer" />
          <span className="tree-glyph"><InboxIcon size={16} /></span>
          <span className="grow truncate">{noneLabel}</span>
        </button>
      )}

      <div className="tree" style={{ maxHeight: 340, overflowY: 'auto' }} role="listbox" aria-label="Storages">
        {isLoading ? (
          <SkeletonList rows={5} height={38} />
        ) : searching ? (
          flat.data?.length ? (
            flat.data.map((storage) => (
              <button
                key={storage.id}
                type="button"
                className="tree-row"
                aria-selected={value === storage.id}
                disabled={disabledIds?.has(storage.id)}
                onClick={() => onChange(storage.id)}
              >
                <span className="tree-spacer" />
                <span className="tree-glyph"><StorageIcon type={storage.type} size={16} /></span>
                <span className="grow stack" style={{ minWidth: 0 }}>
                  <span className="truncate">{storage.name}</span>
                  <span className="text-xs text-subtle truncate">{storage.breadcrumb}</span>
                </span>
              </button>
            ))
          ) : (
            <EmptyState title="No storages match" description={`Nothing here called “${query}”.`} />
          )
        ) : tree.data?.length ? (
          tree.data.map((node) => (
            <TreeBranch
              key={node.id}
              node={node}
              depth={0}
              value={value}
              expanded={autoExpanded}
              onToggle={toggle}
              onChange={onChange}
              disabledIds={disabledIds}
            />
          ))
        ) : (
          <EmptyState title="No storages yet" description="Add a room or a cupboard first." />
        )}
      </div>
    </div>
  );
}

interface BranchProps {
  node: StorageNode;
  depth: number;
  value: string | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onChange: (id: string) => void;
  disabledIds?: Set<string>;
}

function TreeBranch({ node, depth, value, expanded, onToggle, onChange, disabledIds }: BranchProps) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);

  return (
    <>
      <div className="row" style={{ paddingLeft: depth * 14 }}>
        {hasChildren ? (
          <button
            type="button"
            className="tree-toggle"
            data-open={isOpen}
            onClick={() => onToggle(node.id)}
            aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
          >
            <ChevronRight size={14} />
          </button>
        ) : (
          <span className="tree-spacer" />
        )}
        <button
          type="button"
          className="tree-row grow"
          aria-selected={value === node.id}
          disabled={disabledIds?.has(node.id)}
          onClick={() => onChange(node.id)}
        >
          <span className="tree-glyph"><StorageIcon type={node.type} size={16} /></span>
          <span className="grow truncate">{node.name}</span>
          {node.itemCount > 0 && <span className="tree-count">{node.itemCount}</span>}
        </button>
      </div>
      {hasChildren && isOpen && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              value={value}
              expanded={expanded}
              onToggle={onToggle}
              onChange={onChange}
              disabledIds={disabledIds}
            />
          ))}
        </div>
      )}
    </>
  );
}

/** Ids of every ancestor of `targetId`, so its branch can be opened. */
function findPath(nodes: StorageNode[], targetId: string, trail: string[] = []): string[] | null {
  for (const node of nodes) {
    if (node.id === targetId) return trail;
    const deeper = findPath(node.children, targetId, [...trail, node.id]);
    if (deeper) return deeper;
  }
  return null;
}

/** Every id in a subtree — the invalid drop targets when moving that subtree. */
export function collectSubtreeIds(nodes: StorageNode[], rootId: string): Set<string> {
  const result = new Set<string>();
  const walk = (node: StorageNode) => {
    result.add(node.id);
    node.children.forEach(walk);
  };
  const find = (list: StorageNode[]): StorageNode | null => {
    for (const node of list) {
      if (node.id === rootId) return node;
      const found = find(node.children);
      if (found) return found;
    }
    return null;
  };
  const root = find(nodes);
  if (root) walk(root);
  return result;
}
