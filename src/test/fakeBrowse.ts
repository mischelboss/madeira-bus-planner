import type { BrowseData } from "../lib/browseData.ts";

export const FAKE_BROWSE: BrowseData = {
  operators: [
    { code: "HF", name: "Horários do Funchal" },
    { code: "RODOESTE", name: "Rodoeste" },
  ],
  regions: [
    { id: "funchal", name: "Funchal & Around", routeIds: ["hf-1", "hf-20"] },
    { id: "west", name: "West Coast", routeIds: ["rod-139"] },
  ],
  interregionalRouteIds: ["hf-113"],
  routes: {
    "hf-1": {
      routeId: "hf-1",
      shortName: "1",
      operator: "HF",
      operatorName: "Horários do Funchal",
      origin: "Funchal",
      destination: "Câmara de Lobos",
      stops: [
        { name: "Funchal — Praça", lat: 32.65, lon: -16.91 },
        { name: "Ajuda", lat: 32.64, lon: -16.94 },
        { name: "Câmara de Lobos", lat: 32.65, lon: -16.98 },
      ],
      weekday: { first: "06:15", last: "21:40", frequencyMin: 20 },
      weekend: { first: "07:30", last: "20:30", frequencyMin: 40 },
    },
    "hf-20": {
      routeId: "hf-20",
      shortName: "20",
      operator: "HF",
      operatorName: "Horários do Funchal",
      origin: "Funchal",
      destination: "Monte",
      stops: [
        { name: "Funchal — Centro", lat: 32.65, lon: -16.91 },
        { name: "Monte", lat: 32.66, lon: -16.9 },
      ],
      weekday: { first: "07:00", last: "20:00", frequencyMin: 30 },
      weekend: null,
    },
    "rod-139": {
      routeId: "rod-139",
      shortName: "139",
      operator: "RODOESTE",
      operatorName: "Rodoeste",
      origin: "Ribeira Brava",
      destination: "Calheta",
      stops: [
        { name: "Ribeira Brava", lat: 32.67, lon: -17.06 },
        { name: "Ponta do Sol", lat: 32.68, lon: -17.1 },
        { name: "Calheta", lat: 32.72, lon: -17.18 },
      ],
      weekday: { first: "06:30", last: "20:30", frequencyMin: null },
      weekend: { first: "08:00", last: "19:00", frequencyMin: null },
    },
    "hf-113": {
      routeId: "hf-113",
      shortName: "113",
      operator: "HF",
      operatorName: "Horários do Funchal",
      origin: "Santana",
      destination: "Machico",
      stops: [
        { name: "Santana", lat: 32.8, lon: -16.88 },
        { name: "Machico", lat: 32.72, lon: -16.77 },
      ],
      weekday: { first: "06:45", last: "19:45", frequencyMin: 60 },
      weekend: null,
    },
  },
};
