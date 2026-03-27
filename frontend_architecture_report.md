# SmartFlow AI Dashboard - Frontend Architecture Report

## 1. Frontend Technology Stack

- **Framework**: React 19 (TypeScript)
- **Build System**: Vite
- **Map Library**: Leaflet & react-leaflet
- **State Management**: React Context / Hooks (`useState`, `useRef`, `useEffect`), Prop Drilling
- **Visualization Libraries**: Recharts
- **Animation Libraries**: Framer Motion, HTML5 Canvas API (custom `requestAnimationFrame` hooks)
- **Styling**: Tailwind CSS (v4) & PostCSS, Lucide React (Icons)

## 2. Application Structure

The codebase is organized modularly to separate UI components from business logic and static data.

- `src/components/`: Houses all React standard UI components, maps, panels, and widgets (e.g., `CityMap.tsx`, `LiveMapView.tsx`, `SimulationOverlay.tsx`, `AIDecisionPanel.tsx`).
- `src/data/`: Contains static stubs and geographic topology datasets (e.g., `civilLinesEdges.ts`, `civilLinesSignals.ts`).
- `src/services/`: Manages external integrations, API routing variables, and logic for fetching OpenStreetMap elements.
- `src/hooks/`: Contains custom React hooks handling complex local state or animations (e.g., `useVehicleAnimation.ts`).
- `src/types.ts`: TypeScript definitions mapping backend schemas to frontend models (`IntersectionStatus`, `AIStatus`, `GridOverview`).
- `src/App.tsx`: The root application component containing the primary global state container and polling loops.

## 3. Map System

- **Map Library**: Intersections and layers are rendered using `react-leaflet`.
- **Tiles**: The base map uses CartoDB Dark Matter tiles (`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`) for a high-contrast dashboard aesthetic.
- **Rendering**: Signals/Intersections are rendered as dynamic `CircleMarker` components, while connecting roads are `Polyline` components. The color and glow vary directly based on density metrics.
- **Coordinates**: The system relies on absolute geographic coordinates (Latitude/Longitude stored in `lat` and `lng` properties on intersection objects).
- **Zoom/Pan Events**: Handled via custom sub-components utilizing standard `useMapEvents` hooks. `ZoomLevelTracker` updates state with the current zoom to toggle data layers (e.g., heat circles vs. micro-simulation), while `MapFlyTo` triggers smooth camera panning using `map.flyTo()` to specific coordinates on intersection click.

## 4. Simulation Overlay

The real-time vehicle simulation is completely uncoupled from the DOM, utilizing a high-performance HTML5 `<canvas>` positioned absolutely over the Leaflet map.

- **Vehicle Animation**: A `requestAnimationFrame` loop continuously calculates positioning using mathematical interpolation. Vehicles process along geometric paths defined by intersection "arms".
- **Road Drawing**: The canvas context (`ctx`) algorithmically draws detailed road surfaces, lane dividers, stop lines, and zebra crossings dynamically scaling with the Leaflet map's scale factor.
- **Signal Influence**: Vehicle state is continually evaluated against the active intersection's `nsSignal` or `ewSignal`. When a vehicle reaches a progress threshold (e.g. > 0.65) and faces a 'RED' signal, the loop halts its advancement index.
- **Controlling Variables**: Simulation flow relies on `speed`, `density`, `progress` trackers, and arbitrary spawn probabilities (`Math.random() < 0.05`) to create visual density representations. 

## 5. Backend Communication

The frontend makes rigorous use of continuous polling to maintain real-time sync.

**GET /api/grid/state**
- **Method**: GET
- **Response Format**: JSON Object containing arrays of `intersections` and `vehicles`.
- **Component**: `App.tsx`, `LiveMapView.tsx`

**GET /api/emergency/state**
- **Method**: GET
- **Response Format**: JSON Object containing emergency tracking payload (`active`, `route`, `lat`, `lng`, `vehicleId`).
- **Component**: `App.tsx`

**GET /api/grid/overview**
- **Method**: GET
- **Response Format**: JSON Object with arrays of `zones` and `roads` defining macro-level congestion.
- **Component**: `LiveMapView.tsx`

**GET /api/signals/:id**
- **Method**: GET
- **Response Format**: JSON Object with `nsGreenTime` and `ewGreenTime` integer values.
- **Component**: `SignalControlPanel.tsx`

**POST /api/signals/:id/update**
- **Method**: POST
- **Payload**: `{ nsGreenTime: number, ewGreenTime: number, mode: 'MANUAL' }`
- **Response Format**: Success/Failure status.
- **Component**: `SignalControlPanel.tsx`

**POST /api/signals/ai**
- **Method**: POST
- **Payload**: `{ enabled: boolean, scope: "GLOBAL" }`
- **Response Format**: Success/Failure status.
- **Component**: `App.tsx`

**POST /api/emergency/dispatch**
- **Method**: POST
- **Payload**: `{ route: string[], type: string }`
- **Response Format**: Success status, queue ID.
- **Component**: `App.tsx`

**POST /api/emergency/start** & **/api/emergency/stop**
- **Method**: POST
- **Payload**: Empty
- **Response Format**: Status confirmation.
- **Component**: `App.tsx`

**GET /api/ai/status**
- **Method**: GET
- **Response Format**: JSON Object containing predictions and recommendations (`prediction`, `recommendation`, `efficiency`).
- **Component**: `AIDecisionPanel.tsx`

## 6. State Management

- **Intersections**: Stored in `App.tsx` and updated via the `fetchGridState` interval loop (`useState<IntersectionStatus[]>`).
- **Vehicle States**: Backend tracked vehicles are stored in `App.tsx` (`useState`), but micro-simulation visuals reside in `SimulationOverlay.tsx` inside a local `useRef<RoundaboutVehicle[]>`.
- **Signal States**: Included as attributes (`nsSignal`, `ewSignal`) on the intersection objects maintained in `App.tsx`, with specific timers tracked in `SignalControlPanel.tsx`.
- **Congestion Metrics**: Stored as derived `density` and `congestionScore` properties mapped inside the API parsing logic in `App.tsx` and `LiveMapView.tsx`.
- **AI Predictions**: Global AI performance metrics are tracked locally in `AIDecisionPanel.tsx`, while per-node predictions are attached to intersection nodes in `App.tsx`.

## 7. Data Used by the UI

The frontend natively expects the following fields directly stitched into payloads from the API:

**Grid State Intersections:**
```json
{
  "id": "string",
  "density": "number",
  "congestionScore": "number",
  "nsSignal": "string",
  "ewSignal": "string",
  "aiPrediction": {
    "congestionLevel": "string",
    "flowImprovement": "string"
  }
}
```

**Grid State Vehicles:**
```json
{
  "edge_source": "string",
  "edge_target": "string"
}
```

**AI Status Data:**
```json
{
  "prediction": {
    "location": "string",
    "time": "number"
  },
  "recommendation": {
    "action": "string",
    "value": "string"
  },
  "efficiency": "number"
}
```

## 8. AI Integration Points

- **AI Decision Panel**: Renders real-time NLP-based prediction logs (e.g. "Predicted congestion in X minutes" and "Action: Increase Green Time").
- **Signal Control Widget**: Shows specific "AI ADJUSTED" versus "MANUAL" badges, locking sliders or shifting focus to automated configurations. Provides feedback metrics predicting "Delay Before" vs "Delay After".
- **Map Overlays**: The heatmap intensity (colors shifting to Red/Critical) and connection vectors react to ML density assessments delivered via the `aiPrediction.congestionLevel` attribute. 

## 9. Current Limitations

- **Static Mock Topology**: The grid heavily utilizes hardcoded geographic constraints (`CIVIL_LINES_SIGNALS` arrays) preventing totally dynamic network generations.
- **Rule-based Logic over pure AI**: UI density mapping is slightly interpolated using manual math (`Math.min((vehicleCount * 0.15) + ((backendNode.density || 0) * 0.8), 1) * 0.8 + 0.1`) instead of exclusively relying on the backend's AI output.
- **Canvas Hallucinations (Simulation Limitations)**: The visual micro-simulation running inside the `<canvas>` spawns fake vehicle dots locally based on node density to "look busy". It does not fully rely on a 1:1 positional plot generated by the backend, meaning visual vehicle counts are approximations of genuine data structures.

## 10. Example End-to-End Flow: "Apply AI Optimization"

1. **Frontend Request**: The user clicks the "Apply AI Optimization" button located inside the `AIDecisionPanel` widget.
2. **State & API Call**: The component sets an internal loading state, and invokes the `onApply` prop routing up to `App.tsx`. `App.tsx` fires a `POST /api/signals/ai` request with the payload `{ "enabled": true, "scope": "GLOBAL" }`.
3. **Backend Response**: The backend parses the payload, flips the optimization engine state to active, returns a 200 OK, and transitions its background logic to run predictive timing.
4. **UI Update**: `App.tsx` propagates `aiEnabled === true` down through context. The button changes style to lock as "AI Optimization Active". The `SignalControlPanel` components update local badges to display "AI ADJUSTED".
5. **Simulation Continues**: As the `100ms` polling loop grabs new data from `GET /api/grid/state`, the payload returns the ML-optimized values for `nsSignal`, `ewSignal`, and `density` reductions.
6. **Canvas Update**: `SimulationOverlay.tsx` receives the new `RED/GREEN` signals. Moving canvas vehicles evaluate the updated boolean checks at intersections, resulting in drastically altered traffic flow clearing out jammed arteries in real-time.
