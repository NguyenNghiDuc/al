import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/v4.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Không tìm thấy phần tử #root để render ứng dụng.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
