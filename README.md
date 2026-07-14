# Kosova Torrent Traffic Dashboard

A lightweight, real-time dashboard visualizing network activity and file transfer density across the geographic borders of Kosovo. 

🌐 **Live Demo:** [https://shdynila.github.io/kosova-torrent-traffic/](https://shdynila.github.io/kosova-torrent-traffic/)

## Overview
This interactive heatmap uses `Leaflet.js` and `Turf.js` to strictly constrain network density coordinates within a custom GeoJSON cutout of Kosovo's national borders. 

The dashboard runs entirely client-side and paints intense network concentrations while preventing "heatmap bleed" into neighboring geographies.

## Features
- **Strict Geometric Constraints:** Utilizes a Point-in-Polygon validation loop to ensure data points render purely within official map boundaries.
- **Dynamic Layering:** Uses custom Leaflet Panes to ensure heatmap Canvas elements perfectly overlay SVG map vectors without Z-index collisions.
- **Interactive Inspection:** Hover over active heatmap clusters to inspect the specific file transfers occurring at those geographic points.
- **Fallback Simulation Engine:** Capable of fetching live metric streams from an internal REST API (`/api/torrent-metrics`), but automatically falls back to an internal visual physics engine if the endpoint goes offline, preventing a broken UI state.

## Tech Stack
- **Hugo** (Static Site Generator)
- **Leaflet.js** + **Leaflet.heat** (Mapping & Heatmap UI)
- **Turf.js** (Geospatial Analysis)
- **GitHub Actions** (CI/CD to Pages)
