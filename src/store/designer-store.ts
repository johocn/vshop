import { create } from 'zustand'
import type {
  BeadMaterial,
  AccessorySpec,
  PresetTemplate,
  BraceletSpec,
  EaseLevel,
  LayoutMode,
  BeadAnchor,
  JointMode,
  ClaspType,
} from '../types'
import {
  beadRepository,
  DEFAULT_MAIN_BEAD_ID,
  DEFAULT_SECONDARY_BEAD_ID,
  DEFAULT_FOCAL_BEAD_ID,
  DEFAULT_PALETTE_IDS,
} from '../data/repository'
import { getTemplate } from '../data/templates'

const defaultSpec: BraceletSpec = {
  wristSize: 160, // mm
  ease: 'comfort',
  layoutMode: 'solid',
  mainMaterialId: DEFAULT_MAIN_BEAD_ID,
  diameter: 8,
  gap: 0.6,
  seed: 1,
  secondaryMaterialId: DEFAULT_SECONDARY_BEAD_ID,
  spacerEnabled: false,
  spacerEvery: 3,
  spacerId: 'spacer-silicon',
  viewTilt: 0.5,
  rotation: 0,
  // —— 生成系统默认 ——
  paletteIds: [DEFAULT_MAIN_BEAD_ID, DEFAULT_SECONDARY_BEAD_ID],
  sizeVariation: 0,
  jointMode: 'direct',
  claspType: 'magnet',
  insertEvery: 0,
  insertChance: 0,
  centerAccessoryIds: [],
  decorationIds: [],
  anchors: [],
}

interface DesignerState {
  materials: BeadMaterial[]
  accessories: AccessorySpec[]
  templates: PresetTemplate[]
  spec: BraceletSpec
  loaded: boolean
  load: () => Promise<void>
  lookup: (id: string) => BeadMaterial | undefined
  // 原有设计器 actions
  setWristMm: (mm: number) => void
  setEase: (e: EaseLevel) => void
  setDiameter: (d: number) => void
  setLayoutMode: (m: LayoutMode) => void
  setMain: (id: string) => void
  setSecondary: (id?: string) => void
  setSeed: (n: number) => void
  toggleSpacer: () => void
  setSpacerEvery: (n: number) => void
  setSpacerId: (id?: string) => void
  setViewTilt: (t: number) => void
  setRotation: (r: number) => void
  setFocal: (id?: string) => void
  setFocalCount: (n: number) => void
  applySpec: (spec: BraceletSpec) => void
  // 生成系统 actions
  setSpec: (partial: Partial<BraceletSpec>) => void
  setPaletteIds: (ids: string[]) => void
  togglePaletteId: (id: string) => void
  setSizeVariation: (v: number) => void
  toggleCenterId: (id: string) => void
  toggleDecorationId: (id: string) => void
  setJointMode: (j: JointMode) => void
  setClaspType: (c: ClaspType) => void
  applyTemplate: (templateId: string) => void
  setAnchors: (anchors: BeadAnchor[]) => void
  addAnchor: (a: BeadAnchor) => void
  removeAnchor: (index: number) => void
  reseed: () => void
}

export const useDesignerStore = create<DesignerState>((set, get) => ({
  materials: [],
  accessories: [],
  templates: [],
  spec: defaultSpec,
  loaded: false,

  load: async () => {
    if (get().loaded) return
    const [materials, accessories, templates] = await Promise.all([
      beadRepository.listMaterials(),
      beadRepository.listAccessories(),
      beadRepository.listTemplates(),
    ])
    set({ materials, accessories, templates, loaded: true })
  },

  lookup: (id) => get().materials.find((m) => m.id === id),

  setWristMm: (mm) => set((s) => ({ spec: { ...s.spec, wristSize: Math.min(220, Math.max(120, Math.round(mm))) } })),
  setEase: (e) => set((s) => ({ spec: { ...s.spec, ease: e } })),
  setDiameter: (d) => set((s) => ({ spec: { ...s.spec, diameter: d } })),
  setLayoutMode: (m) =>
    set((s) => ({
      spec: {
        ...s.spec,
        layoutMode: m,
        focalId: m === 'focal' && !s.spec.focalId ? DEFAULT_FOCAL_BEAD_ID : s.spec.focalId,
      },
    })),
  setMain: (id) => set((s) => ({ spec: { ...s.spec, mainMaterialId: id } })),
  setSecondary: (id) => set((s) => ({ spec: { ...s.spec, secondaryMaterialId: id } })),
  setSeed: (n) => set((s) => ({ spec: { ...s.spec, seed: n } })),
  toggleSpacer: () => set((s) => ({ spec: { ...s.spec, spacerEnabled: !s.spec.spacerEnabled } })),
  setSpacerEvery: (n) => set((s) => ({ spec: { ...s.spec, spacerEvery: Math.max(1, n) } })),
  setSpacerId: (id) => set((s) => ({ spec: { ...s.spec, spacerId: id } })),
  setViewTilt: (t) => set((s) => ({ spec: { ...s.spec, viewTilt: Math.min(1, Math.max(0, t)) } })),
  setRotation: (r) => set((s) => ({ spec: { ...s.spec, rotation: r } })),
  setFocal: (id) => set((s) => ({ spec: { ...s.spec, focalId: id } })),
  setFocalCount: (n) => set((s) => ({ spec: { ...s.spec, focalCount: Math.max(0, Math.min(3, n)) } })),
  applySpec: (spec) => set({ spec: { ...spec } }),

  setSpec: (partial) => set((s) => ({ spec: { ...s.spec, ...partial } })),
  setPaletteIds: (ids) => set((s) => ({ spec: { ...s.spec, paletteIds: ids } })),
  togglePaletteId: (id) =>
    set((s) => {
      const cur = s.spec.paletteIds ?? []
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
      return { spec: { ...s.spec, paletteIds: next } }
    }),
  setSizeVariation: (v) => set((s) => ({ spec: { ...s.spec, sizeVariation: Math.min(1, Math.max(0, v)) } })),
  toggleCenterId: (id) =>
    set((s) => {
      const cur = s.spec.centerAccessoryIds ?? []
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
      return { spec: { ...s.spec, centerAccessoryIds: next } }
    }),
  toggleDecorationId: (id) =>
    set((s) => {
      const cur = s.spec.decorationIds ?? []
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
      return { spec: { ...s.spec, decorationIds: next } }
    }),
  setJointMode: (j) => set((s) => ({ spec: { ...s.spec, jointMode: j } })),
  setClaspType: (c) => set((s) => ({ spec: { ...s.spec, claspType: c } })),
  applyTemplate: (templateId) => {
    const t = getTemplate(templateId)
    if (!t) return
    set((s) => ({ spec: { ...s.spec, presetTemplateId: templateId, ...t.params, anchors: t.anchors ?? s.spec.anchors } }))
  },
  setAnchors: (anchors) => set((s) => ({ spec: { ...s.spec, anchors } })),
  addAnchor: (a) => set((s) => ({ spec: { ...s.spec, anchors: [...(s.spec.anchors ?? []), a] } })),
  removeAnchor: (index) =>
    set((s) => ({ spec: { ...s.spec, anchors: (s.spec.anchors ?? []).filter((_, i) => i !== index) } })),
  reseed: () => set((s) => ({ spec: { ...s.spec, seed: Math.floor(Math.random() * 100000) } })),
}))
