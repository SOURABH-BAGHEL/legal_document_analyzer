import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Select } from "../components/Select";

const OPTIONS = [
  { value: "", label: "All file types" },
  { value: "pdf", label: "PDF", meta: 3 },
  { value: "docx", label: "DOCX" },
  { value: "txt", label: "TXT" },
];

function Harness({ onChange = () => {} }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <>
      <Select ariaLabel="File type" value={value} options={OPTIONS} onChange={(v) => { setValue(v); onChange(v); }} />
      <button type="button">outside</button>
    </>
  );
}

const trigger = () => screen.getByRole("combobox", { name: "File type" });

describe("Select", () => {
  it("opens with a click, marks the current choice and selects an option", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(trigger());
    expect(screen.getByRole("option", { name: "All file types" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("option", { name: /PDF/ }));
    expect(onChange).toHaveBeenCalledWith("pdf");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger()).toHaveTextContent("PDF");
  });

  it("works from the keyboard", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    trigger().focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(trigger()).toHaveAttribute("aria-activedescendant", expect.stringContaining("option-2"));
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("docx");
    expect(trigger()).toHaveFocus();
  });

  it("supports End, Escape and type-ahead", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    trigger().focus();
    await userEvent.keyboard(" {End}{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();

    await userEvent.keyboard("t{Enter}");
    expect(onChange).toHaveBeenCalledWith("txt");
  });

  it("closes on an outside click without changing the value", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(trigger());
    await userEvent.click(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stays closed when disabled", async () => {
    render(<Select ariaLabel="File type" value="" options={OPTIONS} onChange={() => {}} disabled />);
    await userEvent.click(trigger());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
