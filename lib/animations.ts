// Reusable animation variants for Framer Motion
export const animations = {
  // Modal animations
  modal: {
    initial: {
      opacity: 0,
      y: 8,
    },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.22,
        ease: [0.22, 1, 0.36, 1],
      }
    },
    exit: {
      opacity: 0,
      y: 6,
      transition: { duration: 0.15 }
    }
  },

  // Card entrance/hover
  card: {
    initial: { 
      opacity: 0, 
      y: 20 
    },
    animate: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: 0.4,
        ease: "easeOut"
      }
    },
    hover: {
      y: -4,
      transition: {
        duration: 0.2,
        ease: "easeOut"
      }
    }
  },

  // Card 3D hover (like wishlist)
  card3D: {
    initial: { 
      opacity: 0, 
      y: 20,
      rotateX: 0,
      rotateY: 0
    },
    animate: { 
      opacity: 1, 
      y: 0,
      rotateX: 0,
      rotateY: 0,
      transition: {
        duration: 0.4,
        ease: "easeOut"
      }
    },
    hover: {
      y: -8,
      rotateX: 6,
      rotateY: -6,
      scale: 1.02,
      transition: {
        duration: 0.3,
        ease: "easeOut"
      }
    }
  },

  // Game card hover (more intense 3D)
  gameCard: {
    initial: { 
      opacity: 0, 
      y: 20,
      rotateZ: 0
    },
    animate: { 
      opacity: 1, 
      y: 0,
      rotateZ: 0,
      transition: {
        duration: 0.4,
        ease: "easeOut"
      }
    },
    hover: {
      y: -4,
      scale: 1.01,
      transition: {
        duration: 0.3,
        ease: "easeOut"
      }
    }
  },

  // Card deletion (gamified)
  cardDelete: {
    exit: {
      opacity: 0,
      scale: 0.98,
      y: 10,
      transition: {
        duration: 0.5,
        ease: [0.4, 0, 1, 1]
      }
    }
  },

  // Card editing (glow effect)
  cardEdit: {
    animate: {
      boxShadow: [
        "0 0 0 0px rgba(59, 130, 246, 0)",
        "0 0 0 8px rgba(59, 130, 246, 0.1)",
        "0 0 0 0px rgba(59, 130, 246, 0)"
      ],
      transition: {
        duration: 1.5,
        repeat: 1,
        ease: "easeOut"
      }
    }
  },

  // Stagger children
  staggerContainer: {
    animate: {
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.1
      }
    }
  },

  // Button interactions
  button: {
    hover: {
      scale: 1.05,
      transition: {
        duration: 0.2,
        ease: "easeOut"
      }
    },
    tap: {
      scale: 0.95,
      transition: {
        duration: 0.1
      }
    }
  },

  // Fade in
  fadeIn: {
    initial: { opacity: 0 },
    animate: { 
      opacity: 1,
      transition: { duration: 0.3 }
    }
  },

  // Slide in from left
  slideInLeft: {
    initial: { 
      opacity: 0, 
      x: -20 
    },
    animate: { 
      opacity: 1, 
      x: 0,
      transition: { duration: 0.3 }
    }
  },

  // Slide in from right
  slideInRight: {
    initial: { 
      opacity: 0, 
      x: 20 
    },
    animate: { 
      opacity: 1, 
      x: 0,
      transition: { duration: 0.3 }
    }
  },

  // Scale in
  scaleIn: {
    initial: { 
      opacity: 0, 
      scale: 0.8 
    },
    animate: { 
      opacity: 1, 
      scale: 1,
      transition: {
        duration: 0.3,
        ease: "easeOut"
      }
    }
  },

  // Bounce in
  bounceIn: {
    initial: { 
      opacity: 0, 
      scale: 0 
    },
    animate: { 
      opacity: 1, 
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 500,
        damping: 25,
        duration: 0.5
      }
    }
  }
} as const;

// Hover effect styles

// Hover effect styles
export const hoverEffects = {
  cardHover: "transition-all duration-200 hover:shadow-lg hover:scale-105",
  buttonHover: "transition-all duration-200 hover:scale-105 active:scale-95",
  elementHover: "transition-all duration-200 hover:brightness-110",
  glowHover: "transition-all duration-200 hover:shadow-[0_0_20px_rgba(59,130,246,0.5)]"
} as const;
