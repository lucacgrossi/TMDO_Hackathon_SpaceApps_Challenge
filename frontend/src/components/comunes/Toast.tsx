"use client";

import { useToast } from "@/lib/toast";

/** Muestra el aviso del store `useToast` con la clase `.toast` del prototipo. */
export default function Toast() {
  const { texto, visible } = useToast();
  return (
    <div className={visible ? "toast on" : "toast"} role="status">
      {texto}
    </div>
  );
}
