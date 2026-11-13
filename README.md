# 🐾 Bark & Ride – Pet Grooming Route Planner

**Bark & Ride** is a multi-van route planner for mobile pet grooming businesses using the **Google Maps Platform Routes API**.

---

## ⚙️ How It Works

* **Geographic Proximity Grouping:** Appointments are partitioned across grooming vans (1–5 vans) using proximity clustering and customer time-window constraints.
* **Google Maps Platform Routes API:** Calculates traffic-aware travel durations, arrival times, and turn-by-turn road polylines for each vehicle tour via `computeRoutes`.
* **Fleet Tracking & Navigation:** Interactive vector map with custom pet avatar markers, van itineraries, shift duration metrics, and 1-click Google Maps navigation export.

---

## 🚀 Key Platform Features

* **🚐 Multi-Van Fleet Dispatching (1–5 Vans):** Intelligent auto fleet sizing, geographic proximity grouping, balanced workload allocation, per-van filtering, and live dispatch summary metrics.
* **⏱️ Time Windows & Urgency Constraints:** Enforces hard client booking windows, dynamic depot shift departure clocks, custom care durations, and mud-level priority scheduling.
* **🗺️ Interactive Vector Map & Directions:** Vector map with custom pet avatar markers, traffic-aware street polylines computed via Google Routes API (`computeRoutes`), segment inspector, and 1-click Google Maps GPS navigation export.
* **🎮 Real-Time Simulation & Telemetry:** Animated street-following van movement with speedometers, shift progression, consumable tracking (shampoo, treats), and live stop status transitions.
* **➕ Pet Appointment Management:** Add custom clients via Google Places Autocomplete, configure care durations (30–90 min), and manually reorder or pin stops.
* **📊 Benchmark Suite & Diagnostics:** Multi-city scenario testing (SF, NYC, LA, Seattle, Austin) comparing manual baselines vs. planned routes, with a raw Routes API payload inspector.
* **🌓 Responsive UI:** Dark and light mode support with high-contrast color palettes and adaptive desktop/tablet/mobile layouts.

---

## 🛠️ Google Maps Platform APIs Used

The application integrates with the following Google Maps Platform APIs:

1. **[Routes API](https://developers.google.com/maps/documentation/routes/compute_route_directions) (`computeRoutes`):**
   Calculates pairwise driving durations, traffic-aware travel matrices, and high-precision polyline geometry for street drawing across all fleet vehicles.
2. **[Maps JavaScript SDK](https://developers.google.com/maps/documentation/javascript):**
   Renders the vector map canvas, advanced interactive markers, and custom UI overlays.
3. **[Places API (New)](https://developers.google.com/maps/documentation/places/web-service/overview):**
   Powers autocomplete address lookups when adding custom pet clients.

---

## 🔑 Environment Variables & API Keys

Create a `.env` file with your configuration:

```env
# 1. Client-Side Key (Public - Maps JavaScript API, Places API)
VITE_GOOGLE_MAPS_API_KEY=AIzaSy...

# 2. Backend Secret Key (Private - Routes API)
GOOGLE_MAPS_API_KEY_BACKEND=AIzaSy...
```

---

## 💻 Running the Application Locally

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Add your `VITE_GOOGLE_MAPS_API_KEY` and `GOOGLE_MAPS_API_KEY_BACKEND`.

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

5. **Build for production:**
   ```bash
   npm run build
   npm start
   ```