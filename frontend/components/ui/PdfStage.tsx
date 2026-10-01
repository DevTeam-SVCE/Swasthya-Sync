"use client";

import styles from "./PdfStage.module.css";

interface PdfStageProps {
  src: string;
  title: string;
  children?: React.ReactNode;
}

export function PdfStage({ src, title, children }: PdfStageProps) {
  return (
    <div className={styles.pdfStage}>
      <iframe title={title} src={src} className={styles.pdf} />
      {children}
    </div>
  );
}
