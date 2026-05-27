"use client";

import { useEffect, useId, useRef } from "react";

import styles from "./morphic-background.module.css";

type Coordinates = {
  x: number;
  y: number;
};

type Bounds = {
  height: number;
  width: number;
};

class Particle {
  private readonly container: HTMLElement;
  private readonly dimensions = { height: 30, width: 30 };
  private readonly element: SVGElement;
  private readonly friction: number;
  private readonly initialX: number;
  private readonly scale: number;
  private readonly siner: number;
  private readonly steps: number;
  private position: number;
  private rotationValue: number;
  private readonly rotationDirection: 1 | -1;

  constructor(
    container: HTMLElement,
    coordinates: Coordinates,
    friction: number,
    ballColor: string,
    bounds: Bounds,
  ) {
    this.container = container;
    this.friction = friction;
    this.initialX = coordinates.x;
    this.position = coordinates.y;
    this.steps = Math.max(240, bounds.height / 2);
    this.rotationValue = Math.random() * 180;
    this.rotationDirection = Math.random() > 0.5 ? 1 : -1;
    this.scale = 0.52 + Math.random() * 2.15;
    this.siner = (bounds.width / 4.2) * (0.35 + Math.random());
    this.element = this.render(ballColor, coordinates);
  }

  public move() {
    this.position -= this.friction;
    const top = this.position;
    const left =
      this.initialX +
      Math.sin((this.position * Math.PI) / this.steps) * this.siner;

    this.rotationValue += this.friction * 0.85;
    const rotation = this.rotationValue * this.rotationDirection;

    this.element.style.transform = `translate3d(${left}px, ${top}px, 0) scale(${this.scale}) rotate(${rotation}deg)`;

    if (this.position < -this.dimensions.height * this.scale * 3) {
      this.destroy();
      return false;
    }

    return true;
  }

  private destroy() {
    this.element.remove();
  }

  private render(ballColor: string, coordinates: Coordinates) {
    const svgNamespace = "http://www.w3.org/2000/svg";
    const svgElement = document.createElementNS(svgNamespace, "svg");
    svgElement.setAttribute("viewBox", "0 0 67.4 67.4");
    svgElement.setAttribute("class", styles.particle);

    const circleElement = document.createElementNS(svgNamespace, "circle");
    circleElement.setAttribute("cx", "33.7");
    circleElement.setAttribute("cy", "33.7");
    circleElement.setAttribute("r", "33.7");
    circleElement.setAttribute("fill", ballColor);

    svgElement.appendChild(circleElement);
    svgElement.style.width = `${this.dimensions.width}px`;
    svgElement.style.height = `${this.dimensions.height}px`;
    svgElement.style.transform = `translate3d(${coordinates.x}px, ${coordinates.y}px, 0)`;

    this.container.appendChild(svgElement);
    return svgElement;
  }
}

type MorphicBackgroundProps = {
  ballColor?: string;
  className?: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function getBounds(container: HTMLElement): Bounds {
  const rect = container.getBoundingClientRect();

  return {
    height: Math.max(360, rect.height),
    width: Math.max(320, rect.width),
  };
}

export function MorphicBackground({
  ballColor = "#5382fe",
  className,
}: MorphicBackgroundProps) {
  const rawFilterId = useId();
  const filterId = `quietly-morphic-${rawFilterId.replaceAll(":", "")}`;
  const particleContainerRef = useRef<HTMLDivElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameIdRef = useRef<number | null>(null);
  const intervalIdRef = useRef<number | null>(null);
  const isPausedRef = useRef(false);

  useEffect(() => {
    const container = particleContainerRef.current;

    if (!container) {
      return;
    }

    const createParticle = (startY?: number) => {
      const bounds = getBounds(container);
      const particle = new Particle(
        container,
        {
          x: Math.random() * bounds.width,
          y: startY ?? bounds.height + 120 + Math.random() * 80,
        },
        0.72 + Math.random() * 0.82,
        ballColor,
        bounds,
      );

      particlesRef.current.push(particle);
    };

    const seedParticles = () => {
      const bounds = getBounds(container);
      const particleCount = 46;

      container.innerHTML = "";
      particlesRef.current = [];

      for (let index = 0; index < particleCount; index++) {
        const progress = index / Math.max(1, particleCount - 1);
        const y = bounds.height + 130 - progress * (bounds.height + 320);
        createParticle(y);
      }
    };

    const animate = () => {
      if (!isPausedRef.current) {
        particlesRef.current = particlesRef.current.filter((particle) =>
          particle.move(),
        );
      }

      animationFrameIdRef.current = requestAnimationFrame(animate);
    };

    const handleFocus = () => {
      isPausedRef.current = false;
    };
    const handleBlur = () => {
      isPausedRef.current = true;
    };

    const resizeObserver = new ResizeObserver(seedParticles);

    seedParticles();
    resizeObserver.observe(container);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    intervalIdRef.current = window.setInterval(() => {
      if (isPausedRef.current || particlesRef.current.length > 96) {
        return;
      }

      createParticle();
    }, 170);

    animate();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);

      if (intervalIdRef.current) {
        window.clearInterval(intervalIdRef.current);
      }

      if (animationFrameIdRef.current) {
        window.cancelAnimationFrame(animationFrameIdRef.current);
      }

      particlesRef.current = [];
      container.innerHTML = "";
    };
  }, [ballColor]);

  return (
    <div className={cx(styles.root, className)}>
      <div className={styles.backdrop} aria-hidden="true" />
      <div
        ref={particleContainerRef}
        className={styles.particles}
        style={{ filter: `url(#${filterId})` }}
        aria-hidden="true"
      />
      <div className={styles.grain} aria-hidden="true" />
      <svg className={styles.filterSvg} aria-hidden="true" focusable="false">
        <defs>
          <filter id={filterId}>
            <feGaussianBlur in="SourceGraphic" result="blur" stdDeviation="12" />
            <feColorMatrix
              in="blur"
              result="goo"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 21 -9"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>
    </div>
  );
}
