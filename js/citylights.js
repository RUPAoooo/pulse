/**
 * citylights.js — a small fixed set of city positions used only for the faint
 * amber points on the night side of the map. No API, no labels, no clicks:
 * this is scenery, not data.
 *
 * Each row is [longitude, latitude, weight] where weight (0-1) nudges the size
 * and brightness so a megacity reads slightly stronger than a capital.
 */
export const CITIES = [
  /* Asia */
  [139.69, 35.69, 1.0],   // Tokyo
  [126.98, 37.57, 0.9],   // Seoul
  [116.41, 39.90, 0.9],   // Beijing
  [121.47, 31.23, 1.0],   // Shanghai
  [114.17, 22.32, 0.8],   // Hong Kong
  [121.56, 25.03, 0.7],   // Taipei
  [103.82, 1.35, 0.8],    // Singapore
  [100.50, 13.75, 0.8],   // Bangkok
  [106.85, -6.21, 0.9],   // Jakarta
  [120.98, 14.60, 0.8],   // Manila
  [106.63, 10.82, 0.7],   // Ho Chi Minh City
  [77.21, 28.61, 1.0],    // Delhi
  [72.88, 19.08, 0.9],    // Mumbai
  [90.41, 23.81, 0.8],    // Dhaka
  [67.00, 24.86, 0.8],    // Karachi
  [51.39, 35.69, 0.7],    // Tehran
  [55.27, 25.20, 0.7],    // Dubai
  /* Europe, Africa, the Middle East */
  [28.98, 41.01, 0.9],    // Istanbul
  [37.62, 55.76, 0.9],    // Moscow
  [-0.13, 51.51, 1.0],    // London
  [2.35, 48.86, 0.9],     // Paris
  [13.40, 52.52, 0.8],    // Berlin
  [4.90, 52.37, 0.7],     // Amsterdam
  [-3.70, 40.42, 0.8],    // Madrid
  [12.50, 41.90, 0.8],    // Rome
  [18.07, 59.33, 0.6],    // Stockholm
  [10.75, 59.91, 0.6],    // Oslo
  [21.01, 52.23, 0.6],    // Warsaw
  [8.54, 47.38, 0.6],     // Zurich
  [31.24, 30.04, 0.9],    // Cairo
  [3.38, 6.52, 0.8],      // Lagos
  [28.05, -26.20, 0.7],   // Johannesburg
  [36.82, -1.29, 0.6],    // Nairobi
  /* The Americas and Oceania */
  [-74.01, 40.71, 1.0],   // New York
  [-118.24, 34.05, 0.9],  // Los Angeles
  [-87.63, 41.88, 0.8],   // Chicago
  [-79.38, 43.65, 0.7],   // Toronto
  [-99.13, 19.43, 0.9],   // Mexico City
  [-46.63, -23.55, 0.9],  // São Paulo
  [-58.38, -34.60, 0.8],  // Buenos Aires
  [151.21, -33.87, 0.8],  // Sydney
  [144.96, -37.81, 0.7],  // Melbourne
  [174.76, -36.85, 0.6],  // Auckland
];
