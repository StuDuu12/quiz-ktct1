// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/image", () => ({
  default: ({
    priority,
    unoptimized,
    alt = "",
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & {
    priority?: boolean;
    unoptimized?: boolean;
  }) => (
    // The test renders the image boundary as a native image so its public
    // accessibility and layout contract remains observable.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      data-priority={priority ? "true" : "false"}
      data-unoptimized={unoptimized ? "true" : "false"}
      {...props}
    />
  ),
}));

import Home from "@/app/page";

describe("public learning landing", () => {
  it("offers the approved public navigation and authentication paths", () => {
    render(<Home />);

    const navigation = screen.getByRole("navigation", {
      name: "Điều hướng trang giới thiệu",
    });
    expect(within(navigation).getByRole("link", { name: "Giới thiệu" })).toHaveAttribute(
      "href",
      "#gioi-thieu",
    );
    expect(within(navigation).getByRole("link", { name: "Lộ trình" })).toHaveAttribute(
      "href",
      "#lo-trinh",
    );
    expect(within(navigation).getByRole("link", { name: "Vai trò" })).toHaveAttribute(
      "href",
      "#vai-tro",
    );
    expect(within(navigation).getByRole("link", { name: "Đăng nhập" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(
      screen.getByRole("link", { name: "Tạo tài khoản" }),
    ).toHaveAttribute("href", "/register");
  });

  it("states the verified course and mock-exam facts", () => {
    render(<Home />);

    const facts = screen.getByLabelText("Thông tin học phần");
    expect(facts).toHaveTextContent("497");
    expect(facts).toHaveTextContent("6");
    expect(facts).toHaveTextContent("40 câu");
    expect(facts).toHaveTextContent("60 phút");
  });

  it("describes three isolated role experiences without a fake product preview", () => {
    const { container } = render(<Home />);

    expect(
      screen.getByRole("heading", {
        name: "Luyện tập, thi thử và nhìn rõ tiến bộ.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Không gian giảng viên" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Trung tâm quản trị" }),
    ).toBeInTheDocument();
    expect(container.querySelector(".preview-grid")).not.toBeInTheDocument();
  });

  it("uses the approved study image with reserved dimensions and Vietnamese alt text", () => {
    render(<Home />);

    const image = screen.getByRole("img", {
      name: "Hai sinh viên đang cùng ôn tập trong thư viện",
    });
    expect(image).toHaveAttribute("src", "/images/ktct-study-hero.png");
    expect(image).toHaveAttribute("width", "1536");
    expect(image).toHaveAttribute("height", "1024");
    expect(image).toHaveAttribute("sizes");
    expect(image).toHaveAttribute("data-priority", "true");
    expect(image).toHaveAttribute("data-unoptimized", "true");
  });

  it("contains no visible em dash or en dash characters", () => {
    const { container } = render(<Home />);

    expect(container.textContent).not.toMatch(/[—–]/u);
  });
});
